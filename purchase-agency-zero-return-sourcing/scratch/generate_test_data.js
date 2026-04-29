const fs = require('fs');
const path = require('path');

const categories = [
  '전자제품', '가전제품', '의류', '신발', '가방', '화장품', '건강식품', '식품', '어린이제품', '완구',
  '유리제품', '세라믹', '대형가구', '미용도구', '공구', '카메라용품', 'DIY', '자전거용품', '사무용품', '리빙'
];

function generateItem(id) {
  const isMixed = Math.random() > 0.3; 
  const sourceType = isMixed ? 'MIXED' : 'SAFE';
  
  const rand = Math.random();
  
  let title = `테스트 상품 ${id}`;
  let category = id <= 102 ? '카메라용품' : categories[Math.floor(Math.random() * categories.length)];
  let isElectric = false;
  let hasBattery = false;
  
  // v2.7 테스트 케이스 설정
  // P100: 완벽 승인 (Evidence OK, Decision OK, Margin OK)
  // P101: 증거 부족 (Evidence Missing)
  // P102: 금지 문구 (국내 최저가 포함)
  
  let isVerified = id === 100 || id === 101 || id === 102;
  let isReadyData = id === 100 || id === 101 || id === 102 || Math.random() > 0.5;
  let decision = (id === 100 || id === 101 || id === 102) ? 'APPROVE' : '';
  
  let supplierScore = 95;
  let price = 50000;
  let cost = 50; 

  // v2.7 원본 증거 데이터
  let sTitle = `Taobao Item ${id} Original Title`;
  let sPrice = `50.00 CNY`;
  let sOption = `Standard Silver`;
  let sSpec = `Aluminum Alloy, 500g`;
  let sComp = `Body, Pouch, Manual`;
  let sStock = `In Stock`;

  if (id === 101) {
    sSpec = ""; // 증거 부족 테스트
  }

  if (id === 102) {
    title = `국내 최저가 카메라 어댑터 102`; // 금지어 테스트
  }

  // v2.8 카메라/나사 전용 데이터
  let threadSize = "";
  let maleFemaleType = "";
  let conversionDirection = "";
  let material = "알루미늄 합금";
  let length = "20mm";
  let outerDiameter = "15mm";
  let compQty = "1개";
  let sourceOptionVerified = false;

  if (id === 100) {
    threadSize = "1/4인치, 3/8인치";
    maleFemaleType = "수나사(Male), 암나사(Female)";
    conversionDirection = "1/4 암나사 -> 3/8 수나사 변환";
    compQty = "어댑터 본체 1개";
    sourceOptionVerified = true;
  }

  let keySpecs = isReadyData ? '재질 알루미늄 무게 50g' : '';
  let packageComp = isReadyData ? '본체 1개 보관 파우치' : '';
  let compWith = isReadyData ? '범용 1/4인치 나사 호환' : '';
  let notCompWith = isReadyData ? 'M8 규격 나사 호환 불가' : '';
  let usageNotice = isReadyData ? '강한 충격에 주의하세요' : '';
  let returnNotice = isReadyData ? '개봉 후 단순 변심 반품 불가' : '';
  
  if (rand < 0.1 && id > 102) {
    title = `고속 충전기 ${id}`;
    category = '전자제품';
    isElectric = true;
  } else if (id > 102) {
    title = `카메라 삼각대 나사 어댑터 ${id}`;
    category = '카메라용품';
  }

  return {
    id: `P${id.toString().padStart(3, '0')}`,
    title,
    category,
    price_krw: price,
    cost_cny: cost,
    shipping_fee_krw: 3000,
    option_count: 2,
    supplier_score: supplierScore,
    weight_kg: 0.1,
    has_detailed_specs: true,
    source_url: `http://item.taobao.com/${id}`,
    source_type: sourceType,
    key_specifications: keySpecs,
    package_components: packageComp,
    compatible_with: compWith,
    not_compatible_with: notCompWith,
    usage_notice: usageNotice,
    return_notice: returnNotice,
    // 원본 증거 (v2.7)
    source_title: sTitle,
    source_price: sPrice,
    source_shipping_fee: "0.00",
    source_option_name: sOption,
    source_spec_text: sSpec,
    source_component_text: sComp,
    source_seller_name: "Taobao Store A",
    source_review_count: "100",
    source_rating: "4.8",
    source_stock_status: sStock,
    evidence_checked_at: new Date().toISOString(),
    // 검수 필드
    original_page_checked: isVerified,
    spec_verified: isVerified,
    component_verified: isVerified,
    compatibility_verified: isVerified,
    price_verified: isVerified,
    shipping_cost_verified: isVerified,
    supplier_stock_verified: isVerified,
    final_human_decision: decision,
    human_memo: 'v2.7 테스트',
    is_electric: isElectric,
    has_battery: false,
    is_liquid_powder: false,
    is_fragile: false,
    is_wearable: false,
    is_child_product: false,
    is_medical: false,
    is_food: false,
    is_hygiene_related: false,
    is_sharp_tool: false,
    is_body_contact: false,
    is_water_use: false,
    has_medical_claim: false,
    has_brand_logo: false,
    is_unclear_compatibility: false,
    has_search_demand: true,
    is_clear_usage: true,
    is_consumable: true,
    is_hard_to_find_locally: true,
    has_differentiation: true,
    has_sales_history: true,
    // v2.8 카메라/나사 전용 규격
    thread_size: threadSize,
    male_female_type: maleFemaleType,
    conversion_direction: conversionDirection,
    material: material,
    length: length,
    outer_diameter: outerDiameter,
    component_quantity: compQty,
    source_option_verified: sourceOptionVerified
  };
}

const header = [
  'id', 'title', 'category', 'price_krw', 'cost_cny', 'shipping_fee_krw', 'option_count', 'supplier_score', 'weight_kg', 
  'has_detailed_specs', 'source_url', 'source_type', 'key_specifications', 'package_components', 'compatible_with', 
  'not_compatible_with', 'usage_notice', 'return_notice', 
  'source_title', 'source_price', 'source_shipping_fee', 'source_option_name', 'source_spec_text', 'source_component_text',
  'source_seller_name', 'source_review_count', 'source_rating', 'source_stock_status', 'evidence_checked_at',
  'original_page_checked', 'spec_verified', 'component_verified', 
  'compatibility_verified', 'price_verified', 'shipping_cost_verified', 'supplier_stock_verified', 'final_human_decision', 'human_memo',
  'is_electric', 'has_battery', 'is_liquid_powder', 'is_fragile', 'is_wearable', 'is_child_product', 'is_medical', 'is_food', 
  'is_hygiene_related', 'is_sharp_tool', 'is_body_contact', 'is_water_use', 'has_medical_claim', 'has_brand_logo', 
  'is_unclear_compatibility', 'has_search_demand', 'is_clear_usage', 'is_consumable', 'is_hard_to_find_locally', 
  'has_differentiation', 'has_sales_history',
  'thread_size', 'male_female_type', 'conversion_direction', 'material', 'length', 'outer_diameter', 'component_quantity', 'source_option_verified'
];

let csv = header.join(',') + '\n';
for (let i = 1; i <= 120; i++) {
  const item = generateItem(i);
  csv += Object.values(item).map(v => `"${v}"`).join(',') + '\n';
}

fs.writeFileSync(path.join(__dirname, '../data/input.csv'), csv);
console.log("120개의 v2.8 수동등록 패키지 테스트 데이터가 생성되었습니다.");
