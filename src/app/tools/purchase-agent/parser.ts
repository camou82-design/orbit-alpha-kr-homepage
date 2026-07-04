export interface ParseResult {
  titleCandidate: string;
  priceMin: number | null;
  priceMax: number | null;
  pricesDetected: number[];
  optionCountEstimated: number | null;
  optionStatus: 'DETECTED' | 'MANUAL_REQUIRED';
  foundHighRiskKeywords: string[];
  foundReviewKeywords: string[];
  summaryText: string;
}

const HIGH_RISK_KEYWORDS = [
  'kc', '전기', '충전', '배터리', '리튬', '어댑터', '220v', '식품', '식기', '의료', 
  '치료', '화장품', '영유아', '어린이', '장난감', '브랜드', '정품', '샤넬', '루이비통', 
  '나이키', '아디다스', '디즈니'
];

const REVIEW_KEYWORDS = [
  '유리', '세라믹', '파손', '대형', '설치', '조립', '사이즈', '색상', '의류', 
  '신발', '원목', '가죽', '옵션', '반품', '해외배송'
];

// 불용어 목록 (상품명 추출 시 제외할 단어)
const STOP_WORDS = [
  '阿里巴巴', '登录', '注册', '首页', '消息', '进货单', '我的', '客服', '收藏',
  '手机版', '买家', '卖家', '服务', '导航', '搜索', '找货', '查看', '规格', '属性',
  '详情', '评价', '成交', '累积', '代发', '分销', '物流', '发货', '保障', '商家',
  '阿里巴巴', '1688', 'Alibaba', 'taobao', '淘宝'
];

export function parse1688DumpText(rawText: string): ParseResult {
  const cleanText = rawText.trim();
  const lines = cleanText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // 1. 상품명 후보 추출
  let titleCandidate = '';
  for (const line of lines) {
    // 너무 짧거나 너무 긴 라인 패스
    if (line.length < 10 || line.length > 80) continue;
    
    // 불용어 포함된 줄 패스
    const containsStopWord = STOP_WORDS.some(word => line.includes(word));
    if (containsStopWord) continue;

    // 가격 기호가 포함된 줄 패스
    if (/[¥￥元CNYRMB]/.test(line)) continue;
    
    // 이외에 한글 또는 중국어가 주를 이루는 라인을 선택
    titleCandidate = line;
    break;
  }

  // 2. 가격(공급가) 후보 추출
  // ¥, ￥, RMB, CNY, 元, 숫자 패턴 감지
  const prices: number[] = [];
  
  // 패턴 1: ¥ 25.50 또는 CNY 100 등 기호 + 숫자
  const currencySymbolRegex = /(?:¥|￥|RMB|CNY)\s*(\d+(?:\.\d+)?)/gi;
  let match;
  while ((match = currencySymbolRegex.exec(cleanText)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0.1 && val < 50000) { // 비정상 가격 제외
      prices.push(val);
    }
  }

  // 패턴 2: 125元 형태 숫자 + 元
  const yuanSuffixRegex = /(\d+(?:\.\d+)?)\s*元/gi;
  while ((match = yuanSuffixRegex.exec(cleanText)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0.1 && val < 50000) {
      prices.push(val);
    }
  }

  // 중복 제거 및 정렬
  const uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b);
  const priceMin = uniquePrices.length > 0 ? uniquePrices[0] : null;
  const priceMax = uniquePrices.length > 0 ? uniquePrices[uniquePrices.length - 1] : null;

  // 3. 옵션 수 후보 추정
  // 1688 상세페이지에서 옵션 목록은 색상(颜色), 규격(规格), 사이즈(尺寸/款式/型号) 등 키워드 근처에
  // 단가(¥)나 재고(件/库存)가 연속해서 나열됨.
  let optionCountEstimated: number | null = null;
  let optionStatus: 'DETECTED' | 'MANUAL_REQUIRED' = 'MANUAL_REQUIRED';

  // 텍스트 라인 중 옵션 기호들과 재고/가격 속성이 복합 검출되는 패턴 매칭
  // 예: "红色 ¥50.00 100件起" 혹은 "黑色 (库存200)"
  const optionLines = lines.filter(line => {
    const hasOptionKeyword = /(?:颜色|规格|尺寸|款式|型号|색상|규격|사이즈|모델)/.test(line);
    const hasPriceOrStock = /(?:¥|￥|元|件|库存|개|支|双|套|张|箱)/.test(line);
    return hasOptionKeyword || (hasPriceOrStock && line.length < 50 && line.length > 3 && !line.includes('阿里巴巴') && !line.includes('进货'));
  });

  // 가격 기호(¥)가 연속적으로 등장하는 라인들 중 중복을 뺀 개수를 옵션 후보군으로 추정
  const priceIndicatorLines = lines.filter(line => 
    /(?:¥|￥)/.test(line) && 
    line.length < 60 && 
    !line.includes('阿里巴巴') && 
    !line.includes('起批') && 
    !line.includes('分销')
  );

  const potentialOptionCount = Math.max(optionLines.length, priceIndicatorLines.length);

  if (potentialOptionCount > 1 && potentialOptionCount <= 50) {
    optionCountEstimated = potentialOptionCount;
    optionStatus = 'DETECTED';
  } else {
    optionCountEstimated = 1;
    optionStatus = 'MANUAL_REQUIRED';
  }

  // 4. 위험 및 검토 키워드 감지
  const lowerText = cleanText.toLowerCase();
  const foundHighRiskKeywords = HIGH_RISK_KEYWORDS.filter(kw => 
    lowerText.includes(kw.toLowerCase())
  );
  const foundReviewKeywords = REVIEW_KEYWORDS.filter(kw => 
    lowerText.includes(kw.toLowerCase())
  );

  // 5. 원문 일부 요약 (텍스트에서 의미 있는 첫 부분 150자 정도)
  const nonStopWordLines = lines.filter(line => 
    !STOP_WORDS.some(word => line.includes(word)) && 
    line.length > 5
  );
  const summaryText = nonStopWordLines.slice(0, 5).join(' | ').substring(0, 150);

  return {
    titleCandidate: titleCandidate || '수기 입력 필요',
    priceMin,
    priceMax,
    pricesDetected: uniquePrices,
    optionCountEstimated,
    optionStatus,
    foundHighRiskKeywords,
    foundReviewKeywords,
    summaryText
  };
}
