// @ts-nocheck
// Import vscode-elements components
import '@vscode-elements/elements';

// VSCode Webview API
const vscode = acquireVsCodeApi();

interface KeqOperation {
	operationId: string;
	method: string;
	path: string;
}

interface KeqModule {
	module: string;
	operations: KeqOperation[];
}

interface UpdateMessage {
	type: 'update';
	hasConfig: boolean;
	hasKeqCli: boolean;
	modules: KeqModule[];
	error: string | null;
}

let expandedModules = new Set<string>();
let allModules: KeqModule[] = [];
let searchQuery = '';

function render(data: UpdateMessage) {
	allModules = data.modules;
	const root = document.getElementById('root');
	if (!root) {
		return;
	}

	if (data.error) {
		root.innerHTML = `
			<div class="message ${data.error.includes('Failed') ? 'error' : 'info'}">
				<span class="message-icon">${data.error.includes('Failed') ? '❌' : 'ℹ️'}</span>
				<span>${data.error}</span>
			</div>
		`;
		return;
	}

	if (data.modules.length === 0) {
		root.innerHTML = `
			<div class="message info">
				<span class="message-icon">ℹ️</span>
				<span>No API modules found</span>
			</div>
		`;
		return;
	}

	// Apply search filter
	const filteredModules = filterModules(data.modules, searchQuery);

	if (filteredModules.length === 0 && searchQuery) {
		root.innerHTML = `
			<div class="no-results">
				No results found for "${searchQuery}"
			</div>
		`;
		return;
	}

	// Build tree structure using vscode-tree
	const treeItems = filteredModules.map(module => {
		const operationsHtml = module.operations.map(op => `
			<vscode-tree-item
				data-operation="${op.operationId}"
				data-module="${module.module}"
			>
				<vscode-icon slot="icon" name="symbol-method"></vscode-icon>
				${op.operationId}
				<span slot="description">${op.method} ${op.path}</span>
				<span slot="actions" class="action-button" data-action="generate" title="Generate Code" role="button" tabindex="0">
					<vscode-icon name="sync"></vscode-icon>
				</span>
			</vscode-tree-item>
		`).join('');

		return `
			<vscode-tree-item
				data-module="${module.module}"
			>
				<vscode-icon slot="icon" name="folder"></vscode-icon>
				${module.module}
				<span slot="description">${module.operations.length} operations</span>
				${operationsHtml}
			</vscode-tree-item>
		`;
	}).join('');

	root.innerHTML = `<vscode-tree>${treeItems}</vscode-tree>`;

	// Wait for next frame to ensure DOM is updated
	requestAnimationFrame(() => {
		// Attach event listeners for generate buttons
		root.querySelectorAll('.action-button[data-action="generate"]').forEach((button) => {
			const handleAction = (e) => {
				e.stopPropagation();

				// Find the parent tree item
				const treeItem = button.closest('vscode-tree-item[data-operation]');
				if (treeItem) {
					const operationId = treeItem.getAttribute('data-operation');
					const module = treeItem.getAttribute('data-module');

					if (operationId && module) {
						vscode.postMessage({
							type: 'generate',
							operationId,
							module
						});
					}
				}
			};

			button.addEventListener('click', handleAction);

			// Support keyboard navigation
			button.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleAction(e);
				}
			});
		});

		// Restore expanded state and track changes
		const moduleItems = root.querySelectorAll('vscode-tree-item[data-module]');

		moduleItems.forEach((item) => {
			const moduleName = item.getAttribute('data-module');

			// Monitor open attribute changes using MutationObserver
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
						const isOpen = item.hasAttribute('open');
						if (moduleName) {
							if (isOpen) {
								expandedModules.add(moduleName);
							} else {
								expandedModules.delete(moduleName);
							}
						}
					}
				});
			});

			observer.observe(item, {
				attributes: true,
				attributeFilter: ['open']
			});

			// Restore open state
			if (moduleName && expandedModules.has(moduleName)) {
				(item as any).open = true;
			}
		});
	});
}

function filterModules(modules: KeqModule[], query: string): KeqModule[] {
	if (!query) {
		return modules;
	}

	const lowerQuery = query.toLowerCase();
	const filtered: KeqModule[] = [];

	for (const module of modules) {
		// Check if module name matches
		const moduleNameMatches = module.module.toLowerCase().includes(lowerQuery);

		// Filter operations that match
		const matchingOperations = module.operations.filter(op => {
			return (
				op.operationId.toLowerCase().includes(lowerQuery) ||
				op.method.toLowerCase().includes(lowerQuery) ||
				op.path.toLowerCase().includes(lowerQuery)
			);
		});

		// Include module if name matches or has matching operations
		if (moduleNameMatches || matchingOperations.length > 0) {
			filtered.push({
				module: module.module,
				operations: moduleNameMatches ? module.operations : matchingOperations
			});
		}
	}

	return filtered;
}

function setupSearch() {
	const searchBox = document.getElementById('searchBox');
	if (!searchBox) {
		return;
	}

	searchBox.addEventListener('input', (e) => {
		const target = e.target;
		searchQuery = target.value;

		// Re-render with current data
		if (allModules.length > 0) {
			render({
				type: 'update',
				hasConfig: true,
				hasKeqCli: true,
				modules: allModules,
				error: null
			});
		}
	});
}

// Initialize application
async function init() {
	// Wait for all required custom elements to be defined with timeout
	const requiredElements = ['vscode-tree', 'vscode-tree-item', 'vscode-icon'];

	const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000));

	const elementsPromise = Promise.all(
		requiredElements.map(element => customElements.whenDefined(element))
	).then(() => 'loaded');

	try {
		await Promise.race([elementsPromise, timeout]);
	} catch (error) {
		// Continue anyway
	}

	// Setup message listener
	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'update') {
			render(message);
		}
	});

	// Setup search functionality
	setupSearch();

	// Notify extension that webview is ready
	vscode.postMessage({ type: 'ready' });
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
