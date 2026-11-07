import type { followUps as followUpsTable, opportunities as opportunitiesTable } from "./schema.js";
import { startOfMonthLocal } from "../lib/time.js";

const yuan = (value: number) => value * 100;

export const users = [
  { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(600_000) },
  { id: "u_manager_wang", name: "老王", role: "manager" as const, teamId: "team_east", monthlyTargetCents: 0 },
  { id: "u_sales_wang", name: "小王", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(500_000) },
  { id: "u_sales_chen", name: "小陈", role: "sales" as const, teamId: "team_east", monthlyTargetCents: yuan(600_000) },
];

export const customers = [
  { id: "c_huachen", name: "华辰设计", industry: "建筑设计", level: "A" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(1_200_000), creditUsedCents: yuan(1_104_000), paymentTerms: "月结 30 天", status: "active" },
  { id: "c_yuanshan", name: "远山制造", industry: "智能制造", level: "B" as const, ownerId: "u_sales_lin", region: "苏州", creditLimitCents: yuan(30_000), creditUsedCents: yuan(8_000), paymentTerms: "月结 45 天", status: "active" },
  { id: "c_haichuan", name: "海川物流", industry: "物流", level: "B" as const, ownerId: "u_sales_lin", region: "成都", creditLimitCents: yuan(20_000), creditUsedCents: yuan(15_500), paymentTerms: "月结 30 天", status: "active" },
  { id: "c_lingyun", name: "凌云科技", industry: "软件", level: "A" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(80_000), creditUsedCents: yuan(12_000), paymentTerms: "月结 60 天", status: "active" },
  { id: "c_qingsong", name: "青松教育", industry: "教育", level: "C" as const, ownerId: "u_sales_lin", region: "苏州", creditLimitCents: yuan(10_000), creditUsedCents: yuan(2_000), paymentTerms: "预付", status: "active" },
  { id: "c_boyuan", name: "博远医疗", industry: "医疗", level: "A" as const, ownerId: "u_sales_lin", region: "成都", creditLimitCents: yuan(60_000), creditUsedCents: yuan(20_000), paymentTerms: "月结 45 天", status: "active" },
  { id: "c_xinghe", name: "星河零售", industry: "零售", level: "B" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(25_000), creditUsedCents: yuan(9_000), paymentTerms: "月结 30 天", status: "active" },
  { id: "c_tianyi", name: "天翼传媒", industry: "传媒", level: "C" as const, ownerId: "u_sales_lin", region: "苏州", creditLimitCents: yuan(15_000), creditUsedCents: yuan(1_000), paymentTerms: "预付", status: "active" },
  { id: "c_zhihang", name: "智航电子", industry: "电子制造", level: "B" as const, ownerId: "u_sales_wang", region: "上海", creditLimitCents: yuan(400_000), creditUsedCents: yuan(120_000), paymentTerms: "月结 30 天", status: "active" },
  { id: "c_kaiyuan", name: "开源材料", industry: "新材料", level: "B" as const, ownerId: "u_sales_wang", region: "苏州", creditLimitCents: yuan(200_000), creditUsedCents: yuan(30_000), paymentTerms: "月结 45 天", status: "active" },
  { id: "c_haitong", name: "海通能源", industry: "能源", level: "A" as const, ownerId: "u_sales_chen", region: "成都", creditLimitCents: yuan(600_000), creditUsedCents: yuan(210_000), paymentTerms: "月结 60 天", status: "active" },
  { id: "c_yuantu", name: "远途物流", industry: "物流", level: "C" as const, ownerId: "u_sales_chen", region: "上海", creditLimitCents: yuan(80_000), creditUsedCents: yuan(20_000), paymentTerms: "月结 30 天", status: "active" },
  { id: "c_hengtai", name: "恒泰集团", industry: "制造", level: "A" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(5_000_000), creditUsedCents: 186_099_915, paymentTerms: "月结 60 天", status: "active" },
  { id: "c_zhongke", name: "中科智造", industry: "智能制造", level: "A" as const, ownerId: "u_sales_wang", region: "苏州", creditLimitCents: yuan(3_000_000), creditUsedCents: 120_675_480, paymentTerms: "月结 45 天", status: "active" },
  { id: "c_huayun", name: "华云能源", industry: "能源", level: "A" as const, ownerId: "u_sales_chen", region: "成都", creditLimitCents: yuan(2_500_000), creditUsedCents: 87_448_830, paymentTerms: "月结 60 天", status: "active" },
];

export const contacts = [
  { id: "ct_zhang_1", customerId: "c_huachen", name: "张总", title: "采购总监", phone: "138****1001", email: "zhang@huachen.example", isPrimary: true },
  { id: "ct_zhang_2", customerId: "c_yuanshan", name: "张总", title: "IT 经理", phone: "139****2002", email: "zhang@yuanshan.example", isPrimary: true },
  { id: "ct_li_1", customerId: "c_huachen", name: "李经理", title: "行政经理", phone: "137****1002", email: "li@huachen.example", isPrimary: false },
  { id: "ct_wang_1", customerId: "c_haichuan", name: "王主管", title: "采购主管", phone: "136****3001", email: "wang@haichuan.example", isPrimary: true },
  { id: "ct_zhao_1", customerId: "c_lingyun", name: "赵总", title: "CEO", phone: "135****4001", email: "zhao@lingyun.example", isPrimary: true },
  { id: "ct_chen_1", customerId: "c_boyuan", name: "陈主任", title: "设备科", phone: "134****5001", email: "chen@boyuan.example", isPrimary: true },
  { id: "ct_xing_1", customerId: "c_xinghe", name: "周经理", title: "运营经理", phone: "133****6001", email: "zhou@xinghe.example", isPrimary: true },
  { id: "ct_liu_1", customerId: "c_zhihang", name: "刘总", title: "采购总监", phone: "131****2001", email: "liu@zhihang.example", isPrimary: true },
  { id: "ct_sun_1", customerId: "c_kaiyuan", name: "孙经理", title: "IT 经理", phone: "132****2002", email: "sun@kaiyuan.example", isPrimary: true },
  { id: "ct_zhou_1", customerId: "c_haitong", name: "周工", title: "设备科", phone: "133****2003", email: "zhou@haitong.example", isPrimary: true },
  { id: "ct_zheng_1", customerId: "c_yuantu", name: "郑总", title: "运营总监", phone: "134****2004", email: "zheng@yuantu.example", isPrimary: true },
  { id: "ct_he_1", customerId: "c_hengtai", name: "何总", title: "采购总监", phone: "135****2005", email: "he@hengtai.example", isPrimary: true },
  { id: "ct_ma_1", customerId: "c_zhongke", name: "马总", title: "IT 总监", phone: "136****2006", email: "ma@zhongke.example", isPrimary: true },
  { id: "ct_luo_1", customerId: "c_huayun", name: "罗经理", title: "采购经理", phone: "137****2007", email: "luo@huayun.example", isPrimary: true },
];

export const products = [
  { id: "p_x1", sku: "X1", name: "X1 商用笔记本", category: "笔记本", unit: "台", listPriceCents: yuan(7_499), costCents: yuan(6_200), floorPriceCents: yuan(6_999), taxRateBps: 1300, status: "active" },
  { id: "p_x2", sku: "X2", name: "X2 轻薄笔记本", category: "笔记本", unit: "台", listPriceCents: yuan(5_999), costCents: yuan(4_900), floorPriceCents: yuan(5_499), taxRateBps: 1300, status: "active" },
  { id: "p_m27", sku: "M27", name: "M27 27 寸显示器", category: "显示器", unit: "台", listPriceCents: yuan(1_899), costCents: yuan(1_450), floorPriceCents: yuan(1_699), taxRateBps: 1300, status: "active" },
  { id: "p_d6", sku: "D6", name: "D6 扩展坞", category: "配件", unit: "个", listPriceCents: yuan(699), costCents: yuan(420), floorPriceCents: yuan(599), taxRateBps: 1300, status: "active" },
  { id: "p_kb", sku: "KB", name: "KB 无线键鼠套装", category: "配件", unit: "套", listPriceCents: yuan(299), costCents: yuan(160), floorPriceCents: yuan(249), taxRateBps: 1300, status: "active" },
  { id: "p_x3", sku: "X3", name: "X3 轻薄笔记本", category: "笔记本", unit: "台", listPriceCents: yuan(5_499), costCents: yuan(4_500), floorPriceCents: yuan(4_999), taxRateBps: 1300, status: "active" },
  { id: "p_x4", sku: "X4", name: "X4 高性能笔记本", category: "笔记本", unit: "台", listPriceCents: yuan(6_999), costCents: yuan(5_700), floorPriceCents: yuan(6_499), taxRateBps: 1300, status: "active" },
  { id: "p_x5", sku: "X5", name: "X5 移动工作站", category: "笔记本", unit: "台", listPriceCents: yuan(8_999), costCents: yuan(7_500), floorPriceCents: yuan(8_499), taxRateBps: 1300, status: "active" },
  { id: "p_m24", sku: "M24", name: "M24 24 寸显示器", category: "显示器", unit: "台", listPriceCents: yuan(1_499), costCents: yuan(1_100), floorPriceCents: yuan(1_299), taxRateBps: 1300, status: "active" },
  { id: "p_m32", sku: "M32", name: "M32 32 寸显示器", category: "显示器", unit: "台", listPriceCents: yuan(2_699), costCents: yuan(2_100), floorPriceCents: yuan(2_399), taxRateBps: 1300, status: "active" },
  { id: "p_m34", sku: "M34", name: "M34 34 寸带鱼屏", category: "显示器", unit: "台", listPriceCents: yuan(3_299), costCents: yuan(2_600), floorPriceCents: yuan(2_999), taxRateBps: 1300, status: "active" },
  { id: "p_d8", sku: "D8", name: "D8 双口扩展坞", category: "配件", unit: "个", listPriceCents: yuan(899), costCents: yuan(550), floorPriceCents: yuan(799), taxRateBps: 1300, status: "active" },
  { id: "p_d10", sku: "D10", name: "D10 雷电扩展坞", category: "配件", unit: "个", listPriceCents: yuan(1_299), costCents: yuan(800), floorPriceCents: yuan(1_199), taxRateBps: 1300, status: "active" },
  { id: "p_kbp", sku: "KBP", name: "KB Pro 机械键鼠套装", category: "配件", unit: "套", listPriceCents: yuan(399), costCents: yuan(220), floorPriceCents: yuan(349), taxRateBps: 1300, status: "active" },
  { id: "p_kbm", sku: "KBM", name: "KB Mini 便携键鼠", category: "配件", unit: "套", listPriceCents: yuan(199), costCents: yuan(100), floorPriceCents: yuan(169), taxRateBps: 1300, status: "active" },
  { id: "p_t1", sku: "T1", name: "T1 智能会议平板", category: "会议设备", unit: "台", listPriceCents: yuan(12_999), costCents: yuan(10_000), floorPriceCents: yuan(11_999), taxRateBps: 1300, status: "active" },
  { id: "p_t2", sku: "T2", name: "T2 会议摄像头", category: "会议设备", unit: "台", listPriceCents: yuan(2_499), costCents: yuan(1_800), floorPriceCents: yuan(2_199), taxRateBps: 1300, status: "active" },
  { id: "p_c1", sku: "C1", name: "C1 激光打印机", category: "办公设备", unit: "台", listPriceCents: yuan(1_899), costCents: yuan(1_400), floorPriceCents: yuan(1_699), taxRateBps: 1300, status: "active" },
  { id: "p_c2", sku: "C2", name: "C2 企业路由器", category: "网络设备", unit: "台", listPriceCents: yuan(899), costCents: yuan(600), floorPriceCents: yuan(799), taxRateBps: 1300, status: "active" },
  { id: "p_c3", sku: "C3", name: "C3 高速扫描仪", category: "办公设备", unit: "台", listPriceCents: yuan(1_599), costCents: yuan(1_100), floorPriceCents: yuan(1_399), taxRateBps: 1300, status: "active" },
  { id: "p_srv", sku: "SRV", name: "SRV 机架式服务器", category: "服务器", unit: "台", listPriceCents: yuan(14_000), costCents: yuan(11_000), floorPriceCents: yuan(13_000), taxRateBps: 1300, status: "active" },
];

export const priceRules = [
  { id: "pr_x1_a_1", productId: "p_x1", customerLevel: "A" as const, minQty: 1, unitPriceCents: yuan(7_499), discountBps: 0, priority: 10, effectiveFrom: 0, effectiveTo: null },
  { id: "pr_x1_a_100", productId: "p_x1", customerLevel: "A" as const, minQty: 100, unitPriceCents: yuan(7_320), discountBps: 0, priority: 20, effectiveFrom: 0, effectiveTo: null },
  { id: "pr_x1_b_1", productId: "p_x1", customerLevel: "B" as const, minQty: 1, unitPriceCents: yuan(7_599), discountBps: 0, priority: 10, effectiveFrom: 0, effectiveTo: null },
  { id: "pr_x1_a_promo", productId: "p_x1", customerLevel: "A" as const, minQty: 100, unitPriceCents: yuan(7_320), discountBps: 100, priority: 30, effectiveFrom: 0, effectiveTo: null },
  { id: "pr_m27_a_1", productId: "p_m27", customerLevel: "A" as const, minQty: 1, unitPriceCents: yuan(1_799), discountBps: 0, priority: 10, effectiveFrom: 0, effectiveTo: null },
];

export const warehouses = [
  { id: "w_sh", name: "上海仓", region: "上海" },
  { id: "w_sz", name: "苏州仓", region: "苏州" },
  { id: "w_cd", name: "成都仓", region: "成都" },
];

export const inventoryRows = [
  { warehouseId: "w_sh", productId: "p_x1", onHand: 0, reserved: 0, safetyStock: 10, etaDays: 1, version: 0 },
  { warehouseId: "w_sz", productId: "p_x1", onHand: 150, reserved: 20, safetyStock: 20, etaDays: 2, version: 0 },
  { warehouseId: "w_cd", productId: "p_x1", onHand: 50, reserved: 0, safetyStock: 10, etaDays: 3, version: 0 },
  { warehouseId: "w_sh", productId: "p_x2", onHand: 40, reserved: 5, safetyStock: 10, etaDays: 1, version: 0 },
  { warehouseId: "w_sz", productId: "p_m27", onHand: 20, reserved: 12, safetyStock: 10, etaDays: 2, version: 0 },
  { warehouseId: "w_sh", productId: "p_d6", onHand: 300, reserved: 20, safetyStock: 50, etaDays: 1, version: 0 },
  { warehouseId: "w_sh", productId: "p_kb", onHand: 500, reserved: 30, safetyStock: 80, etaDays: 1, version: 0 },
  { warehouseId: "w_sh", productId: "p_srv", onHand: 5, reserved: 0, safetyStock: 10, etaDays: 5, version: 0 },
  { warehouseId: "w_sz", productId: "p_srv", onHand: 10, reserved: 0, safetyStock: 10, etaDays: 3, version: 0 },
  { warehouseId: "w_sh", productId: "p_t1", onHand: 100, reserved: 45, safetyStock: 10, etaDays: 2, version: 0 },
  { warehouseId: "w_cd", productId: "p_x5", onHand: 100, reserved: 40, safetyStock: 10, etaDays: 3, version: 0 },
  { warehouseId: "w_sh", productId: "p_m32", onHand: 100, reserved: 90, safetyStock: 10, etaDays: 1, version: 0 },
];

export function buildQuoteSeeds(now: number) {
  return [
    { id: "q_seed_1", quoteNo: "Q-2026-0001", customerId: "c_lingyun", contactId: "ct_zhao_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 3_749_500, discountTotalCents: 0, taxTotalCents: 487_435, totalCents: 4_236_935, validUntil: now + 24 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 3 * 86400_000, opportunityId: "o_lingyun_laptop" },
    { id: "q_seed_2", quoteNo: "Q-2026-0002", customerId: "c_boyuan", contactId: "ct_chen_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 1_799_700, discountTotalCents: 0, taxTotalCents: 233_961, totalCents: 2_033_661, validUntil: now + 40 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 2 * 86400_000, opportunityId: "o_boyuan_display" },
    { id: "q_seed_3", quoteNo: "Q-2026-0003", customerId: "c_xinghe", contactId: "ct_xing_1", ownerId: "u_sales_lin", status: "converted", subtotalCents: 949_500, discountTotalCents: 0, taxTotalCents: 123_435, totalCents: 1_072_935, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 86400_000 },
    { id: "q_seed_opp_huachen", quoteNo: "Q-2026-0100", customerId: "c_huachen", contactId: "ct_zhang_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 28_000_000, discountTotalCents: 0, taxTotalCents: 3_640_000, totalCents: 31_640_000, validUntil: now + 36 * 3600_000, riskFlags: "[]", notes: "服务器采购报价", createdAt: now - 5 * 86400_000, opportunityId: "o_huachen_server" },
    { id: "q_seed_lin_month", quoteNo: "Q-2026-0101", customerId: "c_hengtai", contactId: "ct_he_1", ownerId: "u_sales_lin", status: "converted", subtotalCents: 58_495_500, discountTotalCents: 0, taxTotalCents: 7_604_415, totalCents: 66_099_915, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 4 * 86400_000 },
    { id: "q_seed_wang_month", quoteNo: "Q-2026-0102", customerId: "c_zhongke", contactId: "ct_ma_1", ownerId: "u_sales_wang", status: "converted", subtotalCents: 35_996_000, discountTotalCents: 0, taxTotalCents: 4_679_480, totalCents: 40_675_480, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 6 * 86400_000 },
    { id: "q_seed_chen_month", quoteNo: "Q-2026-0103", customerId: "c_huayun", contactId: "ct_luo_1", ownerId: "u_sales_chen", status: "converted", subtotalCents: 24_291_000, discountTotalCents: 0, taxTotalCents: 3_157_830, totalCents: 27_448_830, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 8 * 86400_000 },
  ];
}

export function buildOrderSeeds(now: number) {
  const day = 86_400_000;
  // Keep the seeded monthly sales inside the current month so the manager
  // ranking stays meaningful wherever the demo is reset during the month.
  // Month boundaries are local time; nudge the clamp a few hours past
  // midnight so `gt`/`gte` or UTC/local mixes cannot drop the rows.
  const clampToCurrentMonth = (now: number, timestamp: number) =>
    Math.max(timestamp, startOfMonthLocal(now) + 3 * 3_600_000);
  return [
    { id: "o_seed_1", orderNo: "SO-2026-0001", quoteId: "q_seed_3", customerId: "c_xinghe", ownerId: "u_sales_lin", status: "reserved", totalCents: 1_072_935, paymentTerms: "月结 30 天", createdAt: now - 86400_000 },
    { id: "o_seed_lin_month", orderNo: "SO-2026-0101", quoteId: "q_seed_lin_month", customerId: "c_hengtai", ownerId: "u_sales_lin", status: "reserved", totalCents: 66_099_915, paymentTerms: "月结 60 天", createdAt: clampToCurrentMonth(now, now - 4 * day) },
    { id: "o_seed_wang_month", orderNo: "SO-2026-0102", quoteId: "q_seed_wang_month", customerId: "c_zhongke", ownerId: "u_sales_wang", status: "reserved", totalCents: 40_675_480, paymentTerms: "月结 45 天", createdAt: clampToCurrentMonth(now, now - 6 * day) },
    { id: "o_seed_chen_month", orderNo: "SO-2026-0103", quoteId: "q_seed_chen_month", customerId: "c_huayun", ownerId: "u_sales_chen", status: "reserved", totalCents: 27_448_830, paymentTerms: "月结 60 天", createdAt: clampToCurrentMonth(now, now - 8 * day) },
  ];
}

export const quoteLineSeeds = [
  { id: "ql_seed_1_1", quoteId: "q_seed_1", productId: "p_x1", quantity: 5, unitPriceCents: 749_900, discountRateBps: 0, lineTotalCents: 3_749_500, warehouseId: "w_sz" },
  { id: "ql_seed_2_1", quoteId: "q_seed_2", productId: "p_x2", quantity: 3, unitPriceCents: 599_900, discountRateBps: 0, lineTotalCents: 1_799_700, warehouseId: "w_sh" },
  { id: "ql_seed_3_1", quoteId: "q_seed_3", productId: "p_m27", quantity: 5, unitPriceCents: 189_900, discountRateBps: 0, lineTotalCents: 949_500, warehouseId: "w_sz" },
  { id: "ql_seed_opp_huachen", quoteId: "q_seed_opp_huachen", productId: "p_srv", quantity: 20, unitPriceCents: 1_400_000, discountRateBps: 0, lineTotalCents: 28_000_000, warehouseId: "w_sz" },
  { id: "ql_seed_lin_month", quoteId: "q_seed_lin_month", productId: "p_t1", quantity: 45, unitPriceCents: 1_299_900, discountRateBps: 0, lineTotalCents: 58_495_500, warehouseId: "w_sh" },
  { id: "ql_seed_wang_month", quoteId: "q_seed_wang_month", productId: "p_x5", quantity: 40, unitPriceCents: 899_900, discountRateBps: 0, lineTotalCents: 35_996_000, warehouseId: "w_cd" },
  { id: "ql_seed_chen_month", quoteId: "q_seed_chen_month", productId: "p_m32", quantity: 90, unitPriceCents: 269_900, discountRateBps: 0, lineTotalCents: 24_291_000, warehouseId: "w_sh" },
];

export const orderLineSeeds = [
  { id: "ol_seed_1_1", orderId: "o_seed_1", productId: "p_m27", quantity: 5, unitPriceCents: 189_900, warehouseId: "w_sz" },
  { id: "ol_seed_lin_month", orderId: "o_seed_lin_month", productId: "p_t1", quantity: 45, unitPriceCents: 1_299_900, warehouseId: "w_sh" },
  { id: "ol_seed_wang_month", orderId: "o_seed_wang_month", productId: "p_x5", quantity: 40, unitPriceCents: 899_900, warehouseId: "w_cd" },
  { id: "ol_seed_chen_month", orderId: "o_seed_chen_month", productId: "p_m32", quantity: 90, unitPriceCents: 269_900, warehouseId: "w_sh" },
];

export const stockReservationSeeds = [
  { id: "sr_seed_1_1", orderId: "o_seed_1", productId: "p_m27", warehouseId: "w_sz", quantity: 5, status: "active" },
  { id: "sr_seed_lin_month", orderId: "o_seed_lin_month", productId: "p_t1", warehouseId: "w_sh", quantity: 45, status: "active" },
  { id: "sr_seed_wang_month", orderId: "o_seed_wang_month", productId: "p_x5", warehouseId: "w_cd", quantity: 40, status: "active" },
  { id: "sr_seed_chen_month", orderId: "o_seed_chen_month", productId: "p_m32", warehouseId: "w_sh", quantity: 90, status: "active" },
];

export function buildOpportunitySeeds(now: number): Array<typeof opportunitiesTable.$inferInsert> {
  const day = 86_400_000;
  const hour = 3_600_000;
  const todayAt = (hourOfDay: number) => {
    const date = new Date(now);
    date.setHours(hourOfDay, 0, 0, 0);
    return date.getTime();
  };
  return [
    { id: "o_huachen_server", customerId: "c_huachen", ownerId: "u_sales_lin", name: "服务器采购", amountCents: 28_000_000, stage: "quote", probability: 70, expectedCloseDate: now + 20 * day, nextAction: "联系采购确认预算审批与交付时间", nextActionDueAt: todayAt(17), riskLevel: "high", lastFollowUpAt: now - 5 * day, createdAt: now - 30 * day, updatedAt: now - 5 * day },
    { id: "o_huachen_storage", customerId: "c_huachen", ownerId: "u_sales_lin", name: "存储扩容", amountCents: 12_000_000, stage: "solution", probability: 50, expectedCloseDate: now + 40 * day, nextAction: "确认扩容容量与预算", nextActionDueAt: now + 3 * day, riskLevel: "medium", lastFollowUpAt: now - 12 * day, createdAt: now - 45 * day, updatedAt: now - 12 * day },
    { id: "o_yuanshan_storage", customerId: "c_yuanshan", ownerId: "u_sales_lin", name: "存储扩容", amountCents: 12_000_000, stage: "negotiation", probability: 65, expectedCloseDate: now + 15 * day, nextAction: "发送最终报价", nextActionDueAt: todayAt(17), riskLevel: "low", lastFollowUpAt: now - 2 * hour, createdAt: now - 25 * day, updatedAt: now - 2 * hour },
    { id: "o_xinghe_maintenance", customerId: "c_xinghe", ownerId: "u_sales_lin", name: "年度维保", amountCents: 6_000_000, stage: "needs", probability: 30, expectedCloseDate: now + 30 * day, nextAction: "梳理设备清单", nextActionDueAt: now + 5 * day, riskLevel: "low", lastFollowUpAt: now - 3 * day, createdAt: now - 20 * day, updatedAt: now - 3 * day },
    { id: "o_haichuan_workstation", customerId: "c_haichuan", ownerId: "u_sales_lin", name: "移动工作站采购", amountCents: 15_000_000, stage: "needs", probability: 25, expectedCloseDate: now + 35 * day, nextAction: "确认预算来源", nextActionDueAt: now + 2 * day, riskLevel: "high", lastFollowUpAt: now - 4 * day, createdAt: now - 35 * day, updatedAt: now - 4 * day },
    { id: "o_lingyun_laptop", customerId: "c_lingyun", ownerId: "u_sales_lin", name: "笔记本采购", amountCents: 10_000_000, stage: "negotiation", probability: 60, expectedCloseDate: now + 10 * day, nextAction: "确认报价有效期", nextActionDueAt: now + 1 * day, riskLevel: "medium", lastFollowUpAt: now - 4 * day, createdAt: now - 18 * day, updatedAt: now - 4 * day },
    { id: "o_boyuan_display", customerId: "c_boyuan", ownerId: "u_sales_lin", name: "显示器采购", amountCents: 8_000_000, stage: "quote", probability: 40, expectedCloseDate: now + 20 * day, nextAction: "确认数量与交付批次", nextActionDueAt: now + 4 * day, riskLevel: "medium", lastFollowUpAt: now - 6 * day, createdAt: now - 22 * day, updatedAt: now - 6 * day },
    { id: "o_qingsong_edu", customerId: "c_qingsong", ownerId: "u_sales_lin", name: "教学设备采购", amountCents: 4_000_000, stage: "lead", probability: 10, expectedCloseDate: now + 60 * day, nextAction: "完成需求访谈", nextActionDueAt: now + 7 * day, riskLevel: "low", lastFollowUpAt: now - 10 * day, createdAt: now - 12 * day, updatedAt: now - 10 * day },
    { id: "o_zhihang_server", customerId: "c_zhihang", ownerId: "u_sales_wang", name: "服务器采购", amountCents: 22_000_000, stage: "quote", probability: 55, expectedCloseDate: now + 18 * day, nextAction: "确认采购预算", nextActionDueAt: todayAt(17), riskLevel: "high", lastFollowUpAt: now - 6 * day, createdAt: now - 28 * day, updatedAt: now - 6 * day },
    { id: "o_kaiyuan_network", customerId: "c_kaiyuan", ownerId: "u_sales_wang", name: "网络设备升级", amountCents: 9_000_000, stage: "negotiation", probability: 70, expectedCloseDate: now + 12 * day, nextAction: "发送合同草案", nextActionDueAt: now + 2 * day, riskLevel: "low", lastFollowUpAt: now - 1 * day, createdAt: now - 16 * day, updatedAt: now - 1 * day },
    { id: "o_haitong_meeting", customerId: "c_haitong", ownerId: "u_sales_chen", name: "会议设备采购", amountCents: 18_000_000, stage: "solution", probability: 40, expectedCloseDate: now + 25 * day, nextAction: "安排产品演示", nextActionDueAt: now + 3 * day, riskLevel: "medium", lastFollowUpAt: now - 3 * day, createdAt: now - 24 * day, updatedAt: now - 3 * day },
    { id: "o_yuantu_handheld", customerId: "c_yuantu", ownerId: "u_sales_chen", name: "手持终端采购", amountCents: 7_000_000, stage: "needs", probability: 20, expectedCloseDate: now + 45 * day, nextAction: "确认使用场景", nextActionDueAt: now + 6 * day, riskLevel: "low", lastFollowUpAt: now - 8 * day, createdAt: now - 14 * day, updatedAt: now - 8 * day },
  ];
}

export function buildFollowUpSeeds(now: number): Array<typeof followUpsTable.$inferInsert> {
  const day = 86_400_000;
  const hour = 3_600_000;
  return [
    { id: "f_huachen_1", customerId: "c_huachen", opportunityId: "o_huachen_server", actorId: "u_sales_lin", type: "call", content: "联系张总，客户询问交付周期", result: "客户希望下周五前交付", nextAction: "确认预算审批", nextActionDueAt: now + 2 * hour, createdAt: now - 5 * day },
    { id: "f_huachen_2", customerId: "c_huachen", opportunityId: "o_huachen_server", actorId: "u_sales_lin", type: "email", content: "发送服务器采购方案", result: "客户已查看", nextAction: null, nextActionDueAt: null, createdAt: now - 7 * day },
    { id: "f_yuanshan_1", customerId: "c_yuanshan", opportunityId: "o_yuanshan_storage", actorId: "u_sales_lin", type: "wechat", content: "客户回复需要最终报价", result: "客户刚回复，希望尽快给出最终价格", nextAction: "发送最终报价", nextActionDueAt: now + 2 * hour, createdAt: now - 2 * hour },
    { id: "f_zhihang_1", customerId: "c_zhihang", opportunityId: "o_zhihang_server", actorId: "u_sales_wang", type: "call", content: "确认采购预算", result: "预算尚未批复", nextAction: "再次确认预算", nextActionDueAt: now + 4 * hour, createdAt: now - 6 * day },
    { id: "f_lingyun_1", customerId: "c_lingyun", opportunityId: "o_lingyun_laptop", actorId: "u_sales_lin", type: "email", content: "跟进报价有效期", result: "客户要求延长 3 天", nextAction: "重新确认报价", nextActionDueAt: now + day, createdAt: now - 4 * day },
    { id: "f_huachen_storage_1", customerId: "c_huachen", opportunityId: "o_huachen_storage", actorId: "u_sales_lin", type: "meeting", content: "讨论存储扩容容量", result: "待客户确认", nextAction: "确认容量清单", nextActionDueAt: now + 3 * day, createdAt: now - 12 * day },
  ];
}
