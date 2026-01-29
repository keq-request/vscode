// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { KeqWebviewProvider } from './views/keq-webview-provider';

const execAsync = promisify(exec);

const KEQRC_FILES = [
	'.keqrc',

	'.keqrc.js',
	'.keqrc.ts',
	'.keqrc.cjs',
	'.keqrc.mjs',
	'.keqrc.yml',
	'.keqrc.yaml',
	'.keqrc.json',

	'keq.config.js',
	'keq.config.cjs',
	'keq.config.mjs',
	'keq.config.ts',
	'keq.config.yml',
	'keq.config.yaml',
	'keq.config.json'
];

async function checkKeqrcExists(): Promise<boolean> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return false;
	}

	for (const folder of workspaceFolders) {
		for (const filename of KEQRC_FILES) {
			const keqrcPath = path.join(folder.uri.fsPath, filename);
			try {
				await fs.promises.access(keqrcPath);
				return true;
			} catch {
				// File doesn't exist, continue checking
			}
		}
	}
	return false;
}

async function checkKeqCliInstalled(): Promise<boolean> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return false;
	}

	const folder = workspaceFolders[0];
	const packageJsonPath = path.join(folder.uri.fsPath, 'package.json');

	try {
		const content = await fs.promises.readFile(packageJsonPath, 'utf8');
		const packageJson = JSON.parse(content);

		const dependencies = packageJson.dependencies || {};
		const devDependencies = packageJson.devDependencies || {};

		return !!(dependencies['@keq-request/cli'] || devDependencies['@keq-request/cli']);
	} catch {
		return false;
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "keq" is now active!');

	// Check if .keqrc file exists
	const hasKeqrc = await checkKeqrcExists();
	const hasKeqCli = await checkKeqCliInstalled();

	// Register the webview explorer
	const webviewProvider = new KeqWebviewProvider(
		context.extensionUri,
		hasKeqrc,
		hasKeqCli
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			KeqWebviewProvider.viewType,
			webviewProvider
		)
	);

	if (hasKeqrc) {
		console.log('Keq config file found');
		if (hasKeqCli) {
			console.log('@keq-request/cli is installed');
		} else {
			console.log('@keq-request/cli is not installed');
		}
	} else {
		console.log('No Keq config file found, showing initialization option');
	}


	// Register command to initialize config file
	const initConfigCommand = vscode.commands.registerCommand('keq.initConfig', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('Please open a workspace folder first.');
			return;
		}

		const folder = workspaceFolders[0].uri.fsPath;
		const initCmd = 'npx keq init';

		try {
			vscode.window.showInformationMessage('Initializing Keq configuration...');

			await execAsync(initCmd, { cwd: folder });

			vscode.window.showInformationMessage('Keq configuration initialized successfully!');

			// Refresh the view
			const hasConfig = await checkKeqrcExists();
			const hasCli = await checkKeqCliInstalled();
			webviewProvider.refresh(hasConfig, hasCli);
		} catch (error: any) {
			const errorMessage = error.stderr || error.message || 'Unknown error occurred';
			vscode.window.showErrorMessage(`Failed to initialize Keq configuration: ${errorMessage}`);
		}
	});

	context.subscriptions.push(initConfigCommand);

	// Register command to generate code for a specific operation
	const generateCommand = vscode.commands.registerCommand('keq.generate', async (operationId: string, _module: string) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('Please open a workspace folder first.');
			return;
		}

		const folder = workspaceFolders[0].uri.fsPath;
		const buildCmd = `npx keq build --operation ${operationId}`;

		vscode.window.showInformationMessage(`Generating code for ${operationId}...`);

		const terminal = vscode.window.createTerminal({
			name: `Keq Generate: ${operationId}`,
			cwd: folder
		});

		terminal.show();
		terminal.sendText(buildCmd);
	});

	context.subscriptions.push(generateCommand);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('keq.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello VsCode from keq!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
