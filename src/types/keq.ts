export interface KeqOperation {
	method: string;
	path: string;
	operationId: string;
}

export interface KeqSchema {
	name: string;
}

export interface KeqModule {
	module: string;
	operations: KeqOperation[];
	components?: {
		schemas?: KeqSchema[];
	};
}
