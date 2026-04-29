/**
 * 구매대행 무반품 소싱 심사 엔진 설정 (v3.2)
 * 코다리 부장: "심사 탈락이랑 업로드 락은 엄연히 다른 거야. 좋은 후보는 락을 걸어서라도 쟁여둬야지!"
 */

export const SCREENING_CRITERIA = {
  MIN_NET_MARGIN_RATE: 0.3, 
  MAX_OPTIONS: 3,           
  APPROVAL_RATE_FAILURE_THRESHOLD: 0.4,
  
  PLATFORM_FEE_RATE: 0.12,  
  PAYMENT_FEE_RATE: 0.03,   
  RETURN_BUFFER_RATE: 0.05, 

  FORBIDDEN_PHRASES: [
    '반품 불가', '교환 불가', '환불 불가', '무조건 환불 불가', '완벽 호환', '100% 호환', 
    '정품', '치료', '교정', '효과 보장', 'KC 인증 완료', '국내 최저가', '무조건', '절대'
  ],

  FORBIDDEN_CATEGORIES: [
    '화장품', '식품', '의료기기', '의약품', '전기', '배터리', '어린이', '완구'
  ],

  RISK_KEYWORDS: [
    '충전', '전기', '배터리', 'KC', '인증', '식품', '치료', '교정', '의료', 
    '어린이', '유아', '아기', '아동', '칼', '공구', '펀칭', '가위'
  ],

  KEYWORD_EXCEPTIONS: {
    '칼': ['칼라', '칼날 없음'],
    '공구': ['정리함', '케이스'],
    '전기': ['전기가 필요 없는']
  }
};

export type SourcingStatus = 'COLLECTED' | 'DUPLICATE' | 'COLLECTION_FAILED';
export type ScreeningStatus = 'APPROVED_CANDIDATE' | 'REVIEW_ONLY' | 'WATCHLIST' | 'REJECTED';
export type UploadLockStatus = 
  | 'BLOCKED_BY_P100_LOCK' 
  | 'BLOCKED_BY_REVIEW_REQUIRED' 
  | 'BLOCKED_BY_RISK'
  | 'NOT_ELIGIBLE_FOR_UPLOAD'
  | 'READY_FOR_MANUAL_TEST'
  | 'NONE';

export type ReviewReasonType = 
  | 'SPEC_MISSING' | 'OPTION_MISSING' | 'COMPONENT_MISSING' | 'COMPATIBILITY_MISSING' 
  | 'SHIPPING_COST_MISSING' | 'SUPPLIER_EVIDENCE_WEAK' | 'MARGIN_UNCERTAIN' 
  | 'DETAIL_PAGE_NEEDS_WORK' | 'KEYWORD_VISIBILITY_WEAK' | 'CS_RISK_MEDIUM' | 'NONE';

export type ReviewPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type WatchlistReasonType = 
  | 'KEYWORD_OBSERVATION' | 'PRODUCT_GROUP_OBSERVATION' | 'PRICE_VOLATILITY' 
  | 'SUPPLIER_UNSTABLE' | 'LOW_MARKETABILITY' | 'DATA_TOO_WEAK' 
  | 'FUTURE_BUNDLE_CANDIDATE' | 'NONE';

export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';

export type HumanDecision = 'APPROVE' | 'HOLD' | 'REJECT' | '';

export interface ProductCandidate {
  id: string;
  title: string;
  category: string;
  price_krw: number;
  cost_cny: number;
  shipping_fee_krw: number;
  option_count: number;
  supplier_score: number;
  weight_kg: number;
  has_detailed_specs: boolean;
  source_url: string;
  source_type: 'MIXED' | 'SAFE';
  
  // 상세페이지 정보
  key_specifications: string;
  package_components: string;
  compatible_with: string;
  not_compatible_with: string;
  usage_notice: string;
  return_notice: string;

  // v2.7 원본 증거 (Evidence)
  source_title: string;
  source_price: string;
  source_shipping_fee: string;
  source_option_name: string;
  source_spec_text: string;
  source_component_text: string;
  source_seller_name: string;
  source_review_count: string;
  source_rating: string;
  source_stock_status: string;
  evidence_checked_at: string;

  // v2.5 검수 필드
  original_page_checked: boolean;
  spec_verified: boolean;
  component_verified: boolean;
  compatibility_verified: boolean;
  price_verified: boolean;
  shipping_cost_verified: boolean;
  supplier_stock_verified: boolean;
  final_human_decision: HumanDecision;
  human_memo: string;
  
  // 리스크 항목
  is_electric: boolean;
  has_battery: boolean;
  is_liquid_powder: boolean;
  is_fragile: boolean;
  is_wearable: boolean;
  is_child_product: boolean;
  is_medical: boolean;
  is_food: boolean;
  is_hygiene_related: boolean;
  is_sharp_tool: boolean;
  is_body_contact: boolean;
  is_water_use: boolean;
  has_medical_claim: boolean;
  has_brand_logo: boolean;
  is_unclear_compatibility: boolean;
  
  // 판매 가능성 항목
  has_search_demand: boolean;
  is_clear_usage: boolean;
  is_consumable: boolean;
  is_hard_to_find_locally: boolean;
  has_differentiation: boolean;
  has_sales_history: boolean;

  // v2.8 카메라/나사 전용 규격
  thread_size?: string;
  male_female_type?: string;
  conversion_direction?: string;
  material?: string;
  length?: string;
  outer_diameter?: string;
  component_quantity?: string;
  source_option_verified?: boolean;
  // v3.0/3.1 자동 소싱 및 점수화 연동 필드
  collected_keyword?: string;
  risk_hint?: string;
  keyword_visibility_score?: number;
  cs_burden_score?: number;
  shipping_reliability_hint?: string;
}

export interface RawSourcedCandidate {
  product_id: string;
  source_name: string;
  source_url: string;
  source_title: string;
  translated_title: string;
  category_guess: string;
  source_price: string;
  source_shipping_fee: string;
  option_count: number;
  option_names: string;
  review_count: string;
  rating: string;
  seller_name: string;
  seller_score: number;
  recent_sales_hint: string;
  image_count: number;
  source_spec_text: string;
  source_component_text: string;
  collected_keyword: string;
  collected_at: string;
  collection_status: 'SUCCESS' | 'FAILED' | 'DUPLICATE';
  risk_hint: string;
  // v3.1 추가
  keyword_metadata?: KeywordMetadata;
  shipping_reliability_hint?: string;
}

export interface KeywordMetadata {
  keyword: string;
  category_group: string;
  allowed_category: string;
  priority: number;
  search_intent: string;
  expected_buyer: string;
  cs_risk_level: 'LOW' | 'MID' | 'HIGH';
  memo: string;
  active: boolean;
}

export interface ScreeningReport {
  productId: string;
  title: string;
  category: string;
  source_url: string;
  
  // v3.2 분리된 상태값
  sourcing_status: SourcingStatus;
  screening_status: ScreeningStatus;
  upload_lock_status: UploadLockStatus;
  
  // v3.5 세부 분류
  review_reason_type?: ReviewReasonType;
  review_priority?: ReviewPriority;
  watchlist_reason_type?: WatchlistReasonType;
  
  // v3.6 증거 보강
  missing_evidence_fields?: string[];

  result: ScreeningStatus; // 하위 호환성 유지
  rejection_gates: string[];
  rejection_reasons: string[];
  approval_reasons: string[];
  risk_keywords: string[];
  margin_rate: number;
  option_count: number;
  supplier_score: number;
  supplier_score_reason: string;
  estimated_cost: number;
  estimated_sale_price: number;
  checked_at: string;
  bundle_suggestion: string;
  is_risk_override_downgraded: boolean;
  is_marketable_but_high_risk: boolean;
  is_safe_but_low_marketability: boolean;
  is_low_price_consumable: boolean;

  // v3.1/3.2 점수화
  visibility_score: number;
  cs_burden_score: number;
  keyword_quality_info: {
    intent: string;
    buyer: string;
  };

  // v3.0/3.2 자동 소싱 연동 필드
  collected_keyword?: string;
  risk_hint?: string;
  
  is_detail_page_ready: boolean;
  is_upload_ready: boolean;
  upload_ready_blocked_reason: string;

  // v2.7 원본 증거 데이터
  source_evidence: {
    title: string;
    price: string;
    shipping_fee: string;
    option_name: string;
    spec_text: string;
    component_text: string;
    seller_name: string;
    review_count: string;
    rating: string;
    stock_status: string;
    shipping_reliability_hint: string;
    recent_sales_hint: string;
    checked_at: string;
  };

  // v2.6 검수 상태
  verification_status: {
    original_page_checked: boolean;
    spec_verified: boolean;
    component_verified: boolean;
    compatibility_verified: boolean;
    price_verified: boolean;
    shipping_cost_verified: boolean;
    supplier_stock_verified: boolean;
    decision: HumanDecision;
  };

  // 상세 마진 계산
  cost_analysis: {
    source_price_krw: number;
    source_shipping_krw: number;
    int_shipping_krw: number;
    platform_fee: number;
    payment_fee: number;
    return_buffer: number;
    final_landed_cost: number;
    final_margin_rate: number;
  };

  // 번들 마진 계산
  bundle_analysis?: {
    quantity: number;
    sale_price: number;
    margin_rate: number;
  };

  detail_page_data: {
    selling_title_draft: string;
    short_description: string;
    key_specifications: string;
    package_components: string;
    compatible_with: string;
    not_compatible_with: string;
    usage_notice: string;
    size_notice: string;
    shipping_notice: string;
    return_notice: string;
    overseas_purchase_notice: string;
    customer_check_before_order: string;
    // v2.8 추가 필드
    thread_size?: string;
    male_female_type?: string;
    conversion_direction?: string;
    blockers: string[];
    warnings: string[];
  };
}
export interface EvidenceEnrichmentQueue {
  product_id: string;
  product_name: string;
  source_url: string;
  review_reason_type: ReviewReasonType;
  missing_evidence_fields: string;
  required_action: string;
  current_screening_status: ScreeningStatus;
  target_status_after_enrichment: ScreeningStatus;
  human_check_required: boolean;
  memo: string;
}

export interface ExpandedKeyword {
  parent_keyword: string;
  expanded_keyword: string;
  reason: string;
  expected_category: string;
  risk_expectation: string;
  cs_risk_expectation: string;
  active: boolean;
  test_limit: number;
}

export interface EnrichedCandidate {
  product_id: string;
  product_name: string;
  source_url: string;
  current_screening_status: ScreeningStatus;
  previous_review_reason_type: ReviewReasonType;
  enriched_fields: string;
  still_missing_fields: string;
  evidence_confidence_summary: string;
  risk_flags_after_enrichment: string;
  final_margin_rate: number;
  supplier_score_reason: string;
  keyword_visibility_score: number;
  cs_burden_score: number;
  promotion_candidate: boolean;
  promotion_block_reason: string;
  next_action: string;
}

export interface EnrichmentFailedCandidate {
  product_id: string;
  product_name: string;
  source_url: string;
  failed_fields: string;
  failure_reason: string;
  recommended_action: string;
  keep_or_drop_suggestion: string;
}

export interface EvidenceSnapshot {
  product_id: string;
  source_url: string;
  captured_title: string;
  captured_option: string;
  captured_price: string;
  captured_shipping_fee: string;
  captured_spec_text: string;
  captured_component_text: string;
  captured_stock_status: string;
  captured_at: string;
}
