import { searchCustomers } from "./read/searchCustomers.js";
import { getCustomer360 } from "./read/getCustomer360.js";
import { checkInventory } from "./read/checkInventory.js";
import { getPricing } from "./read/getPricing.js";
import { getSalesBriefing } from "./read/getSalesBriefing.js";
import { createQuote } from "./write/createQuote.js";
import { convertQuoteToOrder } from "./write/convertQuoteToOrder.js";
import { createAfterSalesTicket } from "./write/createAfterSalesTicket.js";
import type { ToolDefinition } from "./types.js";

export const readTools = [searchCustomers, getCustomer360, checkInventory, getPricing, getSalesBriefing] as ToolDefinition<any, any>[];
export const writeTools = [createQuote, convertQuoteToOrder, createAfterSalesTicket] as ToolDefinition<any, any>[];
export const allTools = [...readTools, ...writeTools];
export const toolMap = new Map(allTools.map((tool) => [tool.name, tool]));
export { executeTool, toolSpecs } from "./registry.js";
