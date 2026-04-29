"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourcingScreener = void 0;
const config_1 = require("./config");
const EXCHANGE_RATE = 190;
class SourcingScreener {
    mapRawToCandidate(raw) {
        const title = raw.translated_title || raw.source_title;
        // 위험 키워드 기반 리스크 추정
        const hasRisk = (keywords) => keywords.some(k => title.toLowerCase().includes(k) || raw.source_spec_text.toLowerCase().includes(k));
        const costCny = parseFloat(raw.source_price);
        const priceMultiplier = 1.2 + Math.random() * 1.8; // 1.2x ~ 3.0x
        const priceKrw = Math.ceil(costCny * EXCHANGE_RATE * priceMultiplier / 100) * 100;
        return {
            id: raw.product_id,
            title: title,
            category: raw.category_guess,
            source_url: raw.source_url,
            source_type: 'MIXED',
            cost_cny: costCny,
            shipping_fee_krw: 0,
            price_krw: priceKrw,
            supplier_score: raw.seller_score * 20,
            option_count: raw.option_count,
            is_electric: hasRisk(['electric', 'battery', 'charge', 'power', 'vold']),
            has_battery: hasRisk(['battery', 'li-ion', 'mah']),
            is_food: hasRisk(['food', 'eat', 'snack', 'drink']),
            is_child_product: hasRisk(['kid', 'child', 'baby', 'toy']),
            is_medical: hasRisk(['medical', 'therapy', 'cure', 'health']),
            is_liquid_powder: hasRisk(['liquid', 'powder', 'oil', 'cream']),
            has_medical_claim: hasRisk(['effective', 'prevent', 'relief']),
            has_brand_logo: raw.risk_hint === 'POTENTIAL_RISK_DETECTED',
            is_wearable: hasRisk(['wear', 'clothing', 'shoes', 'bag']),
            is_fragile: hasRisk(['glass', 'ceramic', 'mirror']),
            weight_kg: 0.5,
            is_unclear_compatibility: !title.toLowerCase().includes('universal') && !title.toLowerCase().includes('standard') && (title.toLowerCase().includes('for') || title.toLowerCase().includes('model')),
            is_sharp_tool: hasRisk(['sharp', 'blade', 'cut', 'knife', 'drill', 'punch']),
            is_hygiene_related: hasRisk(['hygiene', 'skin', 'tooth', 'body']),
            is_body_contact: hasRisk(['massage', 'skin', 'wear']),
            is_water_use: hasRisk(['water', 'shower', 'aquarium']),
            has_detailed_specs: raw.source_spec_text.length > 10,
            key_specifications: raw.source_spec_text,
            package_components: raw.source_component_text,
            usage_notice: '본 제품은 산업용/전문가용 부속품입니다.',
            compatible_with: '',
            not_compatible_with: '',
            return_notice: '',
            source_title: raw.source_title,
            source_price: raw.source_price,
            source_shipping_fee: raw.source_shipping_fee,
            source_option_name: raw.option_names.split(',')[0],
            source_spec_text: raw.source_spec_text,
            source_component_text: raw.source_component_text,
            source_seller_name: raw.seller_name,
            source_review_count: raw.review_count,
            source_rating: raw.rating,
            source_stock_status: 'IN_STOCK',
            evidence_checked_at: raw.collected_at,
            shipping_reliability_hint: raw.shipping_reliability_hint || 'NORMAL',
            original_page_checked: false,
            spec_verified: false,
            component_verified: false,
            compatibility_verified: false,
            price_verified: false,
            shipping_cost_verified: false,
            supplier_stock_verified: false,
            final_human_decision: 'HOLD',
            human_memo: '',
            has_search_demand: Math.random() > 0.3,
            is_clear_usage: Math.random() > 0.2,
            is_consumable: Math.random() > 0.5,
            is_hard_to_find_locally: Math.random() > 0.4,
            has_differentiation: Math.random() > 0.5,
            has_sales_history: parseInt(raw.recent_sales_hint) > 0,
            collected_keyword: raw.collected_keyword,
            risk_hint: raw.risk_hint
        };
    }
    screen(product) {
        const rejectionReasons = [];
        const approvalReasons = [];
        const detectedRiskKeywords = [];
        const missingEvidenceFields = [];
        const risks = {
            legal: product.is_electric || product.has_battery || product.is_food || product.is_child_product || product.is_medical || product.is_liquid_powder || product.has_medical_claim || product.has_brand_logo,
            hard_return: product.is_wearable || product.is_fragile || product.weight_kg > 5.0,
            safety: product.is_sharp_tool || product.is_hygiene_related || product.is_body_contact || product.is_water_use
        };
        if (risks.legal)
            rejectionReasons.push('법적/인증/브랜드 리스크');
        if (risks.hard_return)
            rejectionReasons.push('파손/중량/회수불가 리스크');
        if (risks.safety)
            rejectionReasons.push('안전/위생 리스크');
        for (const forbidden of config_1.SCREENING_CRITERIA.FORBIDDEN_CATEGORIES) {
            if (product.category.includes(forbidden))
                rejectionReasons.push(`금지 카테고리: ${forbidden}`);
        }
        for (const keyword of config_1.SCREENING_CRITERIA.RISK_KEYWORDS) {
            if (product.title.includes(keyword)) {
                rejectionReasons.push(`위험 키워드: ${keyword}`);
                detectedRiskKeywords.push(keyword);
            }
        }
        const sourcePriceKrw = product.cost_cny * EXCHANGE_RATE;
        const calculateMargin = (salePrice, cost) => {
            const platformFee = salePrice * config_1.SCREENING_CRITERIA.PLATFORM_FEE_RATE;
            const paymentFee = salePrice * config_1.SCREENING_CRITERIA.PAYMENT_FEE_RATE;
            const returnBuffer = salePrice * config_1.SCREENING_CRITERIA.RETURN_BUFFER_RATE;
            const finalLandedCost = cost + platformFee + paymentFee + returnBuffer;
            const marginRate = (salePrice - finalLandedCost) / salePrice;
            return { platformFee, paymentFee, returnBuffer, finalLandedCost, marginRate };
        };
        const marginAnalysis = calculateMargin(product.price_krw, sourcePriceKrw);
        const isLowPrice = product.price_krw < 10000;
        const isConsumable = product.is_consumable || product.category.includes('규격');
        const visibilityScore = this.calculateVisibilityScore(product);
        const csBurdenScore = this.calculateCSBurdenScore(product);
        const marketabilityReasons = [];
        if (product.has_search_demand && (product.title.includes('1/4') || product.title.includes('3/8')))
            marketabilityReasons.push('규격형 검색어 존재');
        if (isConsumable)
            marketabilityReasons.push('반복구매/소모품 성격');
        if (product.is_hard_to_find_locally)
            marketabilityReasons.push('국내에서 구하기 불편한 부속품');
        if (product.has_sales_history)
            marketabilityReasons.push('판매 흔적 존재');
        const marketabilityFactors = marketabilityReasons.length;
        const supplierAnalysis = this.analyzeSupplierScore(product);
        const supplierScore = supplierAnalysis.score;
        let screeningStatus = 'REJECTED';
        let uploadLockStatus = 'NONE';
        let reviewReasonType = 'NONE';
        let reviewPriority = 'NONE';
        let watchlistReasonType = 'NONE';
        // v3.6 상세 증거 체크
        if (!product.key_specifications || product.key_specifications === 'Size: Standard')
            missingEvidenceFields.push('source_spec_text 부족');
        if (!product.package_components || product.package_components === '')
            missingEvidenceFields.push('component_quantity 부족');
        if (!product.source_option_name || product.source_option_name === 'Type A')
            missingEvidenceFields.push('source_option_name 부족');
        if (supplierScore < 90)
            missingEvidenceFields.push('supplier_score_reason 부족');
        if (marginAnalysis.marginRate < 0.3)
            missingEvidenceFields.push('final_margin_rate 불확실');
        if (rejectionReasons.length > 0) {
            screeningStatus = 'REJECTED';
            uploadLockStatus = 'BLOCKED_BY_RISK';
        }
        else {
            const marginOk = marginAnalysis.marginRate >= 0.3;
            const optionsOk = product.option_count <= 3;
            const specOk = product.has_detailed_specs && !product.is_unclear_compatibility && !missingEvidenceFields.includes('source_spec_text 부족');
            const isTripodAdapter = product.category.includes('카메라') || product.title.toLowerCase().includes('tripod');
            let tripodEvidenceOk = true;
            if (isTripodAdapter) {
                const hasTitleSpec = product.source_title.includes('1/4') || product.source_title.includes('3/8');
                const hasOptionSpec = product.source_option_name.includes('1/4') || product.source_option_name.includes('3/8');
                const hasSpecText = product.source_spec_text.includes('1/4') || product.source_spec_text.includes('3/8');
                tripodEvidenceOk = hasTitleSpec && hasOptionSpec && hasSpecText;
                if (!tripodEvidenceOk)
                    missingEvidenceFields.push('나사 규격 증거 부족');
            }
            const isHighQuality = supplierScore >= 90 && specOk && tripodEvidenceOk && marginOk && optionsOk && csBurdenScore <= 40 && missingEvidenceFields.length === 0;
            const isMarketable = marketabilityFactors >= 3 && visibilityScore >= 70;
            if (isHighQuality && isMarketable) {
                screeningStatus = 'APPROVED_CANDIDATE';
                uploadLockStatus = 'BLOCKED_BY_P100_LOCK';
            }
            else if (csBurdenScore > 60 || marginAnalysis.marginRate < 0.1) {
                screeningStatus = 'REJECTED';
                uploadLockStatus = 'BLOCKED_BY_RISK';
            }
            else if (isHighQuality || (marginAnalysis.marginRate >= 0.2 && marketabilityFactors >= 2)) {
                screeningStatus = 'REVIEW_ONLY';
                uploadLockStatus = 'BLOCKED_BY_REVIEW_REQUIRED';
                if (!tripodEvidenceOk && isTripodAdapter)
                    reviewReasonType = 'SPEC_MISSING';
                else if (missingEvidenceFields.includes('source_option_name 부족'))
                    reviewReasonType = 'OPTION_MISSING';
                else if (missingEvidenceFields.includes('component_quantity 부족'))
                    reviewReasonType = 'COMPONENT_MISSING';
                else if (supplierScore < 90)
                    reviewReasonType = 'SUPPLIER_EVIDENCE_WEAK';
                else if (marginAnalysis.marginRate < 0.3)
                    reviewReasonType = 'MARGIN_UNCERTAIN';
                else
                    reviewReasonType = 'DETAIL_PAGE_NEEDS_WORK';
                const isHighPriority = marginAnalysis.marginRate >= 0.3 && visibilityScore >= 70 && missingEvidenceFields.length <= 2;
                reviewPriority = isHighPriority ? 'HIGH' : 'MEDIUM';
            }
            else {
                screeningStatus = 'WATCHLIST';
                uploadLockStatus = 'NOT_ELIGIBLE_FOR_UPLOAD';
                watchlistReasonType = marketabilityFactors < 2 ? 'LOW_MARKETABILITY' : 'KEYWORD_OBSERVATION';
            }
        }
        return this.finalizeReport(product, screeningStatus, uploadLockStatus, rejectionReasons, approvalReasons, detectedRiskKeywords, marginAnalysis.marginRate, marginAnalysis, reviewReasonType, reviewPriority, watchlistReasonType, missingEvidenceFields, visibilityScore, csBurdenScore, supplierScore, supplierAnalysis.reason);
    }
    analyzeSupplierScore(product) {
        let score = product.supplier_score;
        const reasons = [];
        const reviewCount = parseInt(product.source_review_count) || 0;
        const rating = parseFloat(product.source_rating) || 0;
        if (reviewCount > 100) {
            score += 5;
            reasons.push('리뷰 100건 이상');
        }
        if (rating > 4.8) {
            score += 5;
            reasons.push('평점 4.8 초과');
        }
        if (product.shipping_reliability_hint === 'FAST') {
            score += 5;
            reasons.push('배송 신뢰도 높음');
        }
        if (reviewCount < 10 && rating < 4.5) {
            score -= 20;
            reasons.push('리뷰 및 평점 근거 부족');
        }
        return { score: Math.min(100, score), reason: reasons.join(', ') || '특이사항 없음' };
    }
    calculateVisibilityScore(product) {
        let score = 50;
        if (product.title.includes('1/4') || product.title.includes('3/8'))
            score += 20;
        if (product.collected_keyword && product.title.includes(product.collected_keyword))
            score += 20;
        return Math.min(100, score);
    }
    calculateCSBurdenScore(product) {
        let score = 30;
        if (product.is_unclear_compatibility)
            score += 30;
        if (product.category.includes('카메라'))
            score += 10;
        return Math.min(100, score);
    }
    finalizeReport(product, screeningStatus, uploadLockStatus, rejectionReasons, approvalReasons, keywords, marginRate, marginAnalysis, reviewReasonType, reviewPriority, watchlistReasonType, missingEvidenceFields, visibilityScore, csBurdenScore, supplierScore, supplierScoreReason) {
        return {
            productId: product.id, title: product.title, category: product.category, source_url: product.source_url,
            screening_status: screeningStatus, sourcing_status: 'COLLECTED', upload_lock_status: uploadLockStatus, result: screeningStatus,
            rejection_gates: [], rejection_reasons: rejectionReasons, approval_reasons: approvalReasons,
            risk_keywords: keywords, margin_rate: marginRate, option_count: product.option_count,
            supplier_score: supplierScore, supplier_score_reason: supplierScoreReason,
            review_reason_type: reviewReasonType, review_priority: reviewPriority, watchlist_reason_type: watchlistReasonType,
            missing_evidence_fields: missingEvidenceFields,
            estimated_cost: marginAnalysis.finalLandedCost, estimated_sale_price: product.price_krw,
            checked_at: new Date().toISOString(), bundle_suggestion: '', is_risk_override_downgraded: false,
            is_marketable_but_high_risk: false, is_safe_but_low_marketability: false,
            is_low_price_consumable: false, is_detail_page_ready: missingEvidenceFields.length === 0,
            is_upload_ready: uploadLockStatus === 'READY_FOR_MANUAL_TEST',
            upload_ready_blocked_reason: uploadLockStatus === 'BLOCKED_BY_P100_LOCK' ? 'v3.6 P100 운영검증 기간 중 확장 제한' : '',
            visibility_score: visibilityScore, cs_burden_score: csBurdenScore,
            keyword_quality_info: { intent: 'SPEC_MATCH', buyer: 'PROFESSIONAL' },
            source_evidence: {
                title: product.source_title, price: product.source_price, shipping_fee: product.source_shipping_fee,
                option_name: product.source_option_name, spec_text: product.source_spec_text,
                component_text: product.source_component_text, seller_name: product.source_seller_name,
                review_count: product.source_review_count, rating: product.source_rating,
                stock_status: product.source_stock_status, shipping_reliability_hint: product.shipping_reliability_hint || 'NORMAL',
                recent_sales_hint: 'EXIST', checked_at: product.evidence_checked_at
            },
            verification_status: {
                original_page_checked: false, spec_verified: false, component_verified: false, compatibility_verified: false,
                price_verified: false, shipping_cost_verified: false, supplier_stock_verified: false, decision: 'HOLD'
            },
            cost_analysis: {
                source_price_krw: product.cost_cny * 190, source_shipping_krw: 0,
                int_shipping_krw: 0, platform_fee: marginAnalysis.platformFee,
                payment_fee: marginAnalysis.paymentFee, return_buffer: marginAnalysis.returnBuffer,
                final_landed_cost: marginAnalysis.finalLandedCost, final_margin_rate: marginAnalysis.marginRate
            },
            detail_page_data: {
                selling_title_draft: '', short_description: '', key_specifications: product.key_specifications,
                package_components: product.package_components, compatible_with: '', not_compatible_with: '',
                usage_notice: '', size_notice: '', shipping_notice: '', return_notice: '',
                overseas_purchase_notice: '', customer_check_before_order: '', blockers: [], warnings: []
            }
        };
    }
}
exports.SourcingScreener = SourcingScreener;
