const yuan = (value: number) => value * 100;

export const users = [
  { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east" },
  { id: "u_manager_wang", name: "老王", role: "manager" as const, teamId: "team_east" },
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
];

export const contacts = [
  { id: "ct_zhang_1", customerId: "c_huachen", name: "张总", title: "采购总监", phone: "138****1001", email: "zhang@huachen.example", isPrimary: true },
  { id: "ct_zhang_2", customerId: "c_yuanshan", name: "张总", title: "IT 经理", phone: "139****2002", email: "zhang@yuanshan.example", isPrimary: true },
  { id: "ct_li_1", customerId: "c_huachen", name: "李经理", title: "行政经理", phone: "137****1002", email: "li@huachen.example", isPrimary: false },
  { id: "ct_wang_1", customerId: "c_haichuan", name: "王主管", title: "采购主管", phone: "136****3001", email: "wang@haichuan.example", isPrimary: true },
  { id: "ct_zhao_1", customerId: "c_lingyun", name: "赵总", title: "CEO", phone: "135****4001", email: "zhao@lingyun.example", isPrimary: true },
  { id: "ct_chen_1", customerId: "c_boyuan", name: "陈主任", title: "设备科", phone: "134****5001", email: "chen@boyuan.example", isPrimary: true },
  { id: "ct_xing_1", customerId: "c_xinghe", name: "周经理", title: "运营经理", phone: "133****6001", email: "zhou@xinghe.example", isPrimary: true },
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
];

export function buildQuoteSeeds(now: number) {
  return [
    { id: "q_seed_1", quoteNo: "Q-2026-0001", customerId: "c_lingyun", contactId: "ct_zhao_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 3_749_500, discountTotalCents: 0, taxTotalCents: 487_435, totalCents: 4_236_935, validUntil: now + 24 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 3 * 86400_000 },
    { id: "q_seed_2", quoteNo: "Q-2026-0002", customerId: "c_boyuan", contactId: "ct_chen_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: 1_799_700, discountTotalCents: 0, taxTotalCents: 233_961, totalCents: 2_033_661, validUntil: now + 40 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 2 * 86400_000 },
    { id: "q_seed_3", quoteNo: "Q-2026-0003", customerId: "c_xinghe", contactId: "ct_xing_1", ownerId: "u_sales_lin", status: "converted", subtotalCents: 949_500, discountTotalCents: 0, taxTotalCents: 123_435, totalCents: 1_072_935, validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 86400_000 },
  ];
}

export function buildOrderSeeds(now: number) {
  return [
    { id: "o_seed_1", orderNo: "SO-2026-0001", quoteId: "q_seed_3", customerId: "c_xinghe", ownerId: "u_sales_lin", status: "reserved", totalCents: 1_072_935, paymentTerms: "月结 30 天", createdAt: now - 86400_000 },
  ];
}

export const quoteLineSeeds = [
  { id: "ql_seed_1_1", quoteId: "q_seed_1", productId: "p_x1", quantity: 5, unitPriceCents: 749_900, discountRateBps: 0, lineTotalCents: 3_749_500, warehouseId: "w_sz" },
  { id: "ql_seed_2_1", quoteId: "q_seed_2", productId: "p_x2", quantity: 3, unitPriceCents: 599_900, discountRateBps: 0, lineTotalCents: 1_799_700, warehouseId: "w_sh" },
  { id: "ql_seed_3_1", quoteId: "q_seed_3", productId: "p_m27", quantity: 5, unitPriceCents: 189_900, discountRateBps: 0, lineTotalCents: 949_500, warehouseId: "w_sz" },
];

export const orderLineSeeds = [
  { id: "ol_seed_1_1", orderId: "o_seed_1", productId: "p_m27", quantity: 5, unitPriceCents: 189_900, warehouseId: "w_sz" },
];

export const stockReservationSeeds = [
  { id: "sr_seed_1_1", orderId: "o_seed_1", productId: "p_m27", warehouseId: "w_sz", quantity: 5, status: "active" },
];
