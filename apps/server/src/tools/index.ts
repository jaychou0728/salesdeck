import { searchCustomers } from "./read/searchCustomers.js";
import { getCustomer360 } from "./read/getCustomer360.js";
import { checkInventory } from "./read/checkInventory.js";
import { getPricing } from "./read/getPricing.js";
import type { ToolDefinition } from "./types.js";

export const readTools = [searchCustomers, getCustomer360, checkInventory, getPricing] as ToolDefinition<any, any>[];
export const writeTools: ToolDefinition<any, any>[] = [];
export const allTools = [...readTools, ...writeTools];
export const toolMap = new Map(allTools.map((tool) => [tool.name, tool]));
export { executeTool, toolSpecs } from "./registry.js";
