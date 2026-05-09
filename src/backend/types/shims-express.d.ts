declare module 'express' {
  export interface Request {
	body: any;
	params: Record<string, string>;
	query: Record<string, any>;
  }

  export interface Response {
	status(code: number): Response;
	json(body?: any): Response;
	send(body?: any): Response;
	setHeader(name: string, value: string): void;
  }

  export type NextFunction = (...args: any[]) => void;

  export interface Router {
	get(path: string, handler: (...args: any[]) => any): Router;
	post(path: string, handler: (...args: any[]) => any): Router;
	patch(path: string, handler: (...args: any[]) => any): Router;
	delete(path: string, handler: (...args: any[]) => any): Router;
	use(...args: any[]): Router;
  }

  export interface Application {
	use(...args: any[]): any;
	get(path: string, handler: (...args: any[]) => any): any;
	listen(port: number, callback?: () => void): any;
  }

  export function json(options?: any): any;
  export function static(path: string): any;

  const express: {
	(): Application;
	json: typeof json;
	static: typeof static;
	Router: typeof Router;
  };

  export default express;
  export function Router(): Router;
}

