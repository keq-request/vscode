import * as vscode from 'vscode';
import { fetchApiList } from '../services/keq-api';
import { KeqModule, KeqOperation } from '../types/keq';

export class KeqWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'keqExplorerWebview';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private hasConfig: boolean,
		private hasKeqCli: boolean
	) {}

	public refresh(hasConfig: boolean, hasKeqCli: boolean): void {
		this.hasConfig = hasConfig;
		this.hasKeqCli = hasKeqCli;
		if (this._view) {
			this._updateWebview();
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'ready':
					await this._updateWebview();
					break;
				case 'generate':
					await this._handleGenerate(data.operationId, data.module);
					break;
				case 'refresh':
					await this._updateWebview();
					break;
			}
		});
	}

	private async _updateWebview() {
		if (!this._view) {
			return;
		}

		let modules: KeqModule[] = [];
		let error: string | null = null;

		if (!this.hasConfig) {
			error = 'No Keq configuration found';
		} else if (!this.hasKeqCli) {
			error = '@keq-request/cli not installed';
		} else {
			try {
				modules = await fetchApiList();
			} catch (e) {
				error = `Failed to load: ${e}`;
			}
		}

		this._view.webview.postMessage({
			type: 'update',
			hasConfig: this.hasConfig,
			hasKeqCli: this.hasKeqCli,
			modules,
			error
		});
	}

	private async _handleGenerate(operationId: string, module: string) {
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
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
		);

		// Get Codicons font URI (pnpm structure)
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'node_modules', '.pnpm', '@vscode+codicons@0.0.44', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" id="vscode-codicon-stylesheet" href="${codiconsUri}">
	<title>Keq Explorer</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
			padding: 8px;
		}

		.search-container {
			position: sticky;
			top: 0;
			background-color: var(--vscode-sideBar-background);
			padding: 8px 0;
			margin-bottom: 8px;
			z-index: 10;
		}

		.search-box {
			width: 100%;
			padding: 6px 8px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			outline: none;
		}

		.search-box:focus {
			border-color: var(--vscode-focusBorder);
		}

		.search-box::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}

		.message {
			display: flex;
			align-items: center;
			padding: 12px;
			gap: 8px;
		}

		.loading {
			padding: 12px;
			text-align: center;
			opacity: 0.7;
		}

		.no-results {
			padding: 12px;
			text-align: center;
			opacity: 0.7;
			font-style: italic;
		}

		vscode-tree {
			width: 100%;
		}

		.operation-item {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
		}

		.operation-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		.operation-name {
			font-weight: 500;
		}

		.operation-description {
			font-size: 0.9em;
			opacity: 0.7;
		}

		/* Custom icon button styles */
		.action-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			background: transparent;
			border: none;
			border-radius: 3px;
			cursor: pointer;
			outline: none;
			color: var(--vscode-icon-foreground);
			transition: background-color 0.1s ease;
		}

		.action-button:hover {
			background: var(--vscode-toolbar-hoverBackground);
		}

		.action-button:active {
			background: var(--vscode-toolbar-activeBackground, var(--vscode-toolbar-hoverBackground));
		}

		.action-button:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
		}

		.action-button vscode-icon {
			pointer-events: none;
		}
	</style>
</head>
<body>
	<div class="search-container">
		<input
			type="text"
			class="search-box"
			id="searchBox"
			placeholder="Search APIs..."
			autocomplete="off"
		/>
	</div>
	<div id="root">
		<div class="loading">Loading...</div>
	</div>

	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
