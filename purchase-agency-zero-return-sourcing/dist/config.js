"use strict";
/**
 * 구매대행 무반품 소싱 심사 엔진 설정 (v3.2)
 * 코다리 부장: "심사 탈락이랑 업로드 락은 엄연히 다른 거야. 좋은 후보는 락을 걸어서라도 쟁여둬야지!"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCREENING_CRITERIA = void 0;
exports.SCREENING_CRITERIA = {
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
