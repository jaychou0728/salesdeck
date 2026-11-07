import { searchCustomers } from "./read/searchCustomers.js";
import { getCustomer360 } from "./read/getCustomer360.js";
import { checkInventory } from "./read/checkInventory.js";
import { getPricing } from "./read/getPricing.js";
import { searchKnowledge } from "./read/searchKnowledge.js";
import { getSalesBriefing } from "./read/getSalesBriefing.js";
import { getSalesPriorities } from "./read/getSalesPriorities.js";
import { getOpportunityDetail } from "./read/getOpportunityDetail.js";
import { suggestActions } from "./read/suggestActions.js";
import { createQuote } from "./write/createQuote.js";
import { convertQuoteToOrder } from "./write/convertQuoteToOrder.js";
import { createAfterSalesTicket } from "./write/createAfterSalesTicket.js";
import { logFollowUp } from "./write/logFollowUp.js";
import { updateOpportunityNextAction } from "./write/updateOpportunityNextAction.js";
import type { ToolDefinition } from "./types.js";

export const readTools = [
  searchCustomers,
  getCustomer360,
  checkInventory,
  getPricing,
  searchKnowledge,
  getSalesBriefing,
  getSalesPriorities,
  getOpportunityDetail,
  suggestActions,
] as ToolDefinition<any, any>[];
export const writeTools = [
  createQuote,
  convertQuoteToOrder,
  createAfterSalesTicket,
  logFollowUp,
  updateOpportunityNextAction,
] as ToolDefinition<any, any>[];
export const allTools = [...readTools, ...writeTools];
export const toolMap = new Map(allTools.map((tool) => [tool.name, tool]));
export { executeTool, toolSpecs } from "./registry.js";
