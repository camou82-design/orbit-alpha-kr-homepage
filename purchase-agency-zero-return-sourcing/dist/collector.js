"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductCollector = void 0;
class ProductCollector {
    usedUrls = new Set();
    usedTitles = new Set();
    async collect(keywordMeta) {
        const results = [];
        // active=false 필터링
        const activeKeywords = keywordMeta.filter(m => m.active);
        for (const meta of activeKeywords) {
            const keyword = meta.keyword;
            // 키워드당 10~20개씩 수집 시뮬레이션
            const count = Math.floor(Math.random() * 11) + 10;
            for (let i = 0; i < count; i++) {
                const id = `RAW_${keyword.replace(/\s+/g, '_')}_${i}`;
                const sourceTitle = `${keyword} - Product Variant ${i}`;
                const sourceUrl = `https://item.taobao.com/item.htm?id=${id}`;
                // 중복 체크
                if (this.usedUrls.has(sourceUrl) || this.usedTitles.has(sourceTitle)) {
                    results.push(this.createCandidate(meta, i, 'DUPLICATE'));
                    continue;
                }
                this.usedUrls.add(sourceUrl);
                this.usedTitles.add(sourceTitle);
                results.push(this.createCandidate(meta, i, 'SUCCESS'));
            }
        }
        return results;
    }
    createCandidate(meta, index, status) {
        const keyword = meta.keyword;
        const id = `RAW_${keyword.replace(/\s+/g, '_')}_${index}_${Math.random().toString(36).substring(2, 7)}`;
        // 위험 키워드 감지
        let riskHint = '';
        const riskKeywords = ['battery', 'food', 'electric', 'cosmetic', 'kids', 'sharp', 'glass', 'medicine'];
        if (riskKeywords.some(rk => keyword.toLowerCase().includes(rk) || index % 15 === 0)) {
            riskHint = 'POTENTIAL_RISK_DETECTED';
        }
        // v3.4: 증거 부족 시뮬레이션 (랜덤하게 데이터 누락)
        const hasFullSpecs = Math.random() > 0.3;
        const hasQty = Math.random() > 0.2;
        const hasFastShipping = Math.random() > 0.5;
        const lowReviews = Math.random() > 0.7;
        return {
            product_id: id,
            source_name: 'Taobao',
            source_url: `https://item.taobao.com/item.htm?id=${id}`,
            source_title: `${keyword} - Item ${index}`,
            translated_title: `[자동번역] ${keyword} - 상품 ${index}`,
            category_guess: meta.category_group,
            source_price: (Math.random() * 100 + 10).toFixed(2),
            source_shipping_fee: '0.00',
            option_count: Math.floor(Math.random() * 10) + 1,
            option_names: (index % 3 === 0) ? '1/4, 3/8, Universal' : 'Type A, Type B',
            review_count: lowReviews ? Math.floor(Math.random() * 5).toString() : Math.floor(Math.random() * 1000).toString(),
            rating: (Math.random() * 1 + 4).toFixed(1),
            seller_name: 'Great Parts Store',
            seller_score: 4.8,
            recent_sales_hint: Math.random() > 0.5 ? '100+' : '0',
            image_count: 5,
            source_spec_text: hasFullSpecs ? `Material: Metal, Size: 1/4 to 3/8, Keyword Intent: ${meta.search_intent}` : 'Size: Standard',
            source_component_text: hasQty ? '1x Screw Adapter' : '',
            collected_keyword: keyword,
            collected_at: new Date().toISOString(),
            collection_status: status,
            risk_hint: riskHint,
            keyword_metadata: meta,
            shipping_reliability_hint: hasFastShipping ? 'FAST' : 'NORMAL'
        };
    }
}
exports.ProductCollector = ProductCollector;
