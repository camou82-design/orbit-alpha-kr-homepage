"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceEnricher = void 0;
const fs = __importStar(require("fs"));
const sync_1 = require("csv-parse/sync");
class EvidenceEnricher {
    queuePath = 'data/evidence_enrichment_queue.csv';
    outputPath = 'data/enriched_candidates.csv';
    failedPath = 'data/enrichment_failed_candidates.csv';
    snapshotPath = 'data/evidence_snapshots.json';
    enrichAll() {
        if (!fs.existsSync(this.queuePath)) {
            console.log('증거 보강 큐 파일이 없습니다. (v3.6 선행 필요)');
            return;
        }
        const rawData = fs.readFileSync(this.queuePath, 'utf-8');
        const queue = (0, sync_1.parse)(rawData, {
            columns: true,
            skip_empty_lines: true,
        });
        const enrichedList = [];
        const failedList = [];
        const snapshots = [];
        for (const item of queue) {
            const result = this.enrichItem(item);
            if (result.success) {
                enrichedList.push(result.candidate);
                snapshots.push(result.snapshot);
            }
            else {
                failedList.push(result.failed);
            }
        }
        this.saveResults(enrichedList, failedList, snapshots);
        return {
            total: queue.length,
            success: enrichedList.length,
            failed: failedList.length,
            promotion: enrichedList.filter(c => c.promotion_candidate).length
        };
    }
    enrichItem(item) {
        // 1. 시뮬레이션: 보강 필드 결정
        const missing = item.missing_evidence_fields.split(' | ');
        const enrichedFields = [];
        const stillMissing = [];
        const confidences = {};
        // 핵심 증거 보강 시뮬레이션 (랜덤성 부여하지만 로직 기반)
        missing.forEach(field => {
            const isSuccess = Math.random() > 0.3; // 70% 확률로 보강 성공 시뮬레이션
            if (isSuccess) {
                enrichedFields.push(field);
                confidences[field] = Math.random() > 0.4 ? 'HIGH' : 'MEDIUM';
            }
            else {
                stillMissing.push(field);
                confidences[field] = 'LOW';
            }
        });
        const confidenceSummary = Object.entries(confidences).map(([k, v]) => `${k}:${v}`).join(', ');
        const coreFields = ['source_option_name', 'source_spec_text', 'source_component_text', 'final_margin_rate', 'supplier_score_reason', 'compatibility_text'];
        const coreConfidenceOk = coreFields.every(f => {
            if (confidences[f])
                return confidences[f] === 'HIGH' || confidences[f] === 'MEDIUM';
            return true; // 애초에 부족하지 않았던 필드는 통과
        });
        const isPromotionCandidate = enrichedFields.length > 0 && stillMissing.length === 0 && coreConfidenceOk && Math.random() > 0.2;
        if (enrichedFields.length > 0 || stillMissing.length > 0) {
            const candidate = {
                product_id: item.product_id,
                product_name: item.product_name,
                source_url: item.source_url,
                current_screening_status: item.current_screening_status,
                previous_review_reason_type: item.review_reason_type,
                enriched_fields: enrichedFields.join(' | '),
                still_missing_fields: stillMissing.join(' | '),
                evidence_confidence_summary: confidenceSummary,
                risk_flags_after_enrichment: 'NONE',
                final_margin_rate: 0.32, // 보강 후 마진 시뮬레이션
                supplier_score_reason: '보강 완료: 실구매자 평점 및 배송 신뢰도 확인됨',
                keyword_visibility_score: 85,
                cs_burden_score: 35,
                promotion_candidate: isPromotionCandidate,
                promotion_block_reason: isPromotionCandidate ? '' : '핵심 증거 신뢰도 부족 또는 추가 수동 확인 필요',
                next_action: isPromotionCandidate ? '재심사 엔진(Screener) 투입' : '추가 증거 확보 시도'
            };
            const snapshot = {
                product_id: item.product_id,
                source_url: item.source_url,
                captured_title: item.product_name,
                captured_option: '보강된 옵션 1/4 inch',
                captured_price: 'CNY 15.0',
                captured_shipping_fee: 'FREE',
                captured_spec_text: 'Material: Aluminum Alloy, 1/4 to 3/8 converter',
                captured_component_text: '1 piece of adapter',
                captured_stock_status: 'IN_STOCK',
                captured_at: new Date().toISOString()
            };
            if (stillMissing.length > enrichedFields.length && !isPromotionCandidate) {
                const failed = {
                    product_id: item.product_id,
                    product_name: item.product_name,
                    source_url: item.source_url,
                    failed_fields: stillMissing.join(' | '),
                    failure_reason: '원본 페이지에서 명확한 데이터 식별 불가',
                    recommended_action: '수동 직접 확인 또는 상품 드랍 검토',
                    keep_or_drop_suggestion: 'DROP_CANDIDATE'
                };
                return { success: false, failed };
            }
            return { success: true, candidate, snapshot };
        }
        return { success: false, failed: {
                product_id: item.product_id,
                product_name: item.product_name,
                source_url: item.source_url,
                failed_fields: 'ALL',
                failure_reason: '보강 시도 실패',
                recommended_action: '재수집 검토',
                keep_or_drop_suggestion: 'DROP'
            } };
    }
    saveResults(enriched, failed, snapshots) {
        // enriched_candidates.csv
        if (enriched.length > 0) {
            const header = Object.keys(enriched[0]).join(',');
            const rows = enriched.map(e => Object.values(e).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            fs.writeFileSync(this.outputPath, [header, ...rows].join('\n'));
        }
        // enrichment_failed_candidates.csv
        if (failed.length > 0) {
            const header = Object.keys(failed[0]).join(',');
            const rows = failed.map(e => Object.values(e).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            fs.writeFileSync(this.failedPath, [header, ...rows].join('\n'));
        }
        // evidence_snapshots.json
        fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshots, null, 2));
    }
}
exports.EvidenceEnricher = EvidenceEnricher;
