import fs from 'fs';
import path from 'path';

const items = [];
const categories = [
  '전자제품', '가전제품', '의류', '신발', '가방', '화장품', '건강식품', '식품', '어린이제품', '완구',
  '유리제품', '세라믹', '대형가구', '미용도구', '공구', '카메라용품', 'DIY', '자전거용품', '사무용품', '리빙'
];

function generateItem(id: number) {
  const isMixed = Math.random() > 0.3; // 70% MIXED, 30% SAFE
  const sourceType = isMixed ? 'MIXED' : 'SAFE';
  
  // 기본적으로 위험한 상품들을 많이 섞음 (Stress Test)
  const rand = Math.random();
  
  let title = `테스트 상품 ${id}`;
  let category = categories[Math.floor(Math.random() * categories.length)];
  let isElectric = false;
  let hasBattery = false;
  let isWearable = false;
  let isFood = false;
  let isChild = false;
  let isFragile = false;
  let isSharp = false;
  let isBodyContact = false;
  let hasSearchDemand = Math.random() > 0.5;
  let isClearUsage = Math.random() > 0.3;
  let isConsumable = Math.random() > 0.6;
  
  if (rand < 0.1) {
    title = `고속 충전기 ${id}`;
    category = '전자제품';
    isElectric = true;
  } else if (rand < 0.2) {
    title = `무선 블루투스 이어폰 ${id}`;
    category = '전자제품';
    hasBattery = true;
    isBodyContact = true;
  } else if (rand < 0.3) {
    title = `여성용 원피스 ${id}`;
    category = '의류';
    isWearable = true;
  } else if (rand < 0.4) {
    title = `유아용 젖병 세정제 ${id}`;
    category = '어린이제품';
    isChild = true;
    isFood = true;
  } else if (rand < 0.5) {
    title = `가죽 펀칭기 세트 ${id}`;
    category = '공구';
    isSharp = true;
  } else if (rand < 0.6) {
    title = `목공용 드릴 비트 ${id}`;
    category = '공구';
    isSharp = true;
  } else if (rand < 0.7) {
    title = `카메라 삼각대 나사 어댑터 ${id}`;
    category = '카메라용품';
    hasSearchDemand = true;
    isClearUsage = true;
    isConsumable = true;
  } else if (rand < 0.8) {
    title = `3D프린터 노즐 교체 부품 ${id}`;
    category = 'DIY';
    hasSearchDemand = true;
    isClearUsage = true;
    isConsumable = true;
  } else if (rand < 0.9) {
    title = `실리콘 케이블 정리 클립 ${id}`;
    category = '사무용품';
    hasSearchDemand = true;
    isClearUsage = true;
    isConsumable = true;
  } else {
    title = `자전거 프레스타 밸브 캡 ${id}`;
    category = '자전거용품';
    hasSearchDemand = true;
    isClearUsage = true;
    isConsumable = true;
  }

  return {
    id: `P${id.toString().padStart(3, '0')}`,
    title,
    category,
    price_krw: Math.floor(Math.random() * 50000) + 5000,
    cost_cny: Math.floor(Math.random() * 100) + 5,
    shipping_fee_krw: 3000,
    option_count: Math.floor(Math.random() * 5) + 1,
    supplier_score: Math.floor(Math.random() * 20) + 80,
    weight_kg: Math.random() * 2,
    has_detailed_specs: Math.random() > 0.1,
    source_url: `http://item.taobao.com/${id}`,
    source_type: sourceType,
    is_electric: isElectric,
    has_battery: hasBattery,
    is_liquid_powder: false,
    is_fragile: isFragile,
    is_wearable: isWearable,
    is_child_product: isChild,
    is_medical: false,
    is_food: isFood,
    is_hygiene_related: false,
    is_sharp_tool: isSharp,
    is_body_contact: isBodyContact,
    is_water_use: false,
    has_medical_claim: false,
    has_brand_logo: false,
    is_unclear_compatibility: false,
    has_search_demand: hasSearchDemand,
    is_clear_usage: isClearUsage,
    is_consumable: isConsumable,
    is_hard_to_find_locally: Math.random() > 0.5,
    has_differentiation: Math.random() > 0.5,
    has_sales_history: Math.random() > 0.5,
    fragile_risk: 10,
    return_shipping_risk: 10
  };
}

const header = [
  'id', 'title', 'category', 'price_krw', 'cost_cny', 'shipping_fee_krw', 'option_count', 'supplier_score', 'weight_kg', 
  'has_detailed_specs', 'source_url', 'source_type', 'is_electric', 'has_battery', 'is_liquid_powder', 'is_fragile', 
  'is_wearable', 'is_child_product', 'is_medical', 'is_food', 'is_hygiene_related', 'is_sharp_tool', 'is_body_contact', 
  'is_water_use', 'has_medical_claim', 'has_brand_logo', 'is_unclear_compatibility', 'has_search_demand', 'is_clear_usage', 
  'is_consumable', 'is_hard_to_find_locally', 'has_differentiation', 'has_sales_history', 'fragile_risk', 'return_shipping_risk'
];

let csv = header.join(',') + '\n';
for (let i = 1; i <= 120; i++) {
  const item = generateItem(i);
  csv += Object.values(item).join(',') + '\n';
}

fs.writeFileSync(path.join(__dirname, '../data/input.csv'), csv);
console.log("120개의 스트레스 테스트 데이터가 생성되었습니다.");
