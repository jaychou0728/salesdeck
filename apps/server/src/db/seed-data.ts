const yuan = (value: number) => value * 100;
const now = Date.now();

export const users = [
  { id: "u_sales_lin", name: "小林", role: "sales" as const, teamId: "team_east" },
  { id: "u_manager_wang", name: "老王", role: "manager" as const, teamId: "team_east" },
];

export const customers = [
  { id: "c_huachen", name: "华辰设计", industry: "建筑设计", level: "A" as const, ownerId: "u_sales_lin", region: "上海", creditLimitCents: yuan(50_000), creditUsedCents: yuan(46_000), paymentTerms: "月结 30 天", status: "active" },
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

const productSeeds = [
  ["p_x1", "X1", "X1 商用笔记本", "笔记本", yuan(7_499), yuan(6_200), yuan(6_999)],
  ["p_x2", "X2", "X2 轻薄笔记本", "笔记本", yuan(5_999), yuan(4_900), yuan(5_499)],
  ["p_m27", "M27", "M27 27 寸显示器", "显示器", yuan(1_899), yuan(1_450), yuan(1_699)],
  ["p_d6", "D6", "D6 扩展坞", "配件", yuan(699), yuan(420), yuan(599)],
  ["p_kb", "KB", "KB 无线键鼠套装", "配件", yuan(299), yuan(160), yuan(249)],
] as const;

export const products = Array.from({ length: 20 }, (_, index) => {
  const base = productSeeds[index % productSeeds.length];
  const suffix = index < productSeeds.length ? "" : `-${index}`;
  return {
    id: index < productSeeds.length ? base[0] : `p_${index}`,
    sku: index < productSeeds.length ? base[1] : `${base[1]}${suffix}`,
    name: index < productSeeds.length ? base[2] : `${base[2]} ${suffix}`,
    category: base[3],
    unit: "台",
    listPriceCents: base[4],
    costCents: base[5],
    floorPriceCents: base[6],
    taxRateBps: 1300,
    status: "active",
  };
});

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
  { warehouseId: "w_sz", productId: "p_m27", onHand: 8, reserved: 2, safetyStock: 10, etaDays: 2, version: 0 },
  { warehouseId: "w_sh", productId: "p_d6", onHand: 300, reserved: 20, safetyStock: 50, etaDays: 1, version: 0 },
  { warehouseId: "w_sh", productId: "p_kb", onHand: 500, reserved: 30, safetyStock: 80, etaDays: 1, version: 0 },
];

export const quoteSeeds = [
  { id: "q_seed_1", quoteNo: "Q-2026-0001", customerId: "c_lingyun", contactId: "ct_zhao_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: yuan(37_998), discountTotalCents: 0, taxTotalCents: yuan(4_939), totalCents: yuan(42_937), validUntil: now + 24 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 3 * 86400_000 },
  { id: "q_seed_2", quoteNo: "Q-2026-0002", customerId: "c_boyuan", contactId: "ct_chen_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: yuan(22_000), discountTotalCents: 0, taxTotalCents: yuan(2_860), totalCents: yuan(24_860), validUntil: now + 40 * 3600_000, riskFlags: "[]", notes: null, createdAt: now - 2 * 86400_000 },
  { id: "q_seed_3", quoteNo: "Q-2026-0003", customerId: "c_xinghe", contactId: "ct_xing_1", ownerId: "u_sales_lin", status: "approved", subtotalCents: yuan(12_000), discountTotalCents: 0, taxTotalCents: yuan(1_560), totalCents: yuan(13_560), validUntil: now + 10 * 86400_000, riskFlags: "[]", notes: null, createdAt: now - 86400_000 },
];

export const orderSeeds = [
  { id: "o_seed_1", orderNo: "SO-2026-0001", quoteId: "q_seed_1", customerId: "c_lingyun", ownerId: "u_sales_lin", status: "reserved", totalCents: yuan(42_937), paymentTerms: "月结 60 天", createdAt: now - 86400_000 },
];
