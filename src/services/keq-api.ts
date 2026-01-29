import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { KeqModule } from '../types/keq';

const execAsync = promisify(exec);

export async function fetchApiList(): Promise<KeqModule[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return [];
	}

	try {
		const { stdout, stderr } = await execAsync('npx keq apis --json', {
			cwd: workspaceFolders[0].uri.fsPath
		});

		// Check if stdout is empty or contains only whitespace
		if (!stdout || !stdout.trim()) {
			console.error('Failed to fetch API list: Empty response from keq apis command');
			if (stderr) {
				console.error('Stderr:', stderr);
			}
			throw new Error('Empty response from keq apis command');
		}

		const modules: KeqModule[] = JSON.parse(stdout.trim());
		return modules;
	} catch (error) {
		console.error('Failed to fetch API list:', error);
		throw error;
	}
}
