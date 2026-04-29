import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { 
  RawSourcedCandidate, ScreeningReport, ScreeningStatus, EvidenceEnrichmentQueue, 
  ExpandedKeyword, EnrichedCandidate, EnrichmentFailedCandidate 
} from './config';
import { SourcingScreener } from './screener';
import { EvidenceEnricher } from './enricher';

async function main() {
  const inputPath = 'data/raw_sourced_candidates.csv';
  const outputPath = 'data/screening_results.csv';
  const reportPath = 'reports/daily_screening_report.md';
  const sourcingReportPath = 'reports/sourcing_report.md';
  const successPatternPath = 'reports/approved_success_pattern.md';

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    return;
  }

  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const records: RawSourcedCandidate[] = parse(rawData, {
    columns: true,
    skip_empty_lines: true,
  });

  const screener = new SourcingScreener();
  const reports: ScreeningReport[] = records.map(record => {
    const candidate = screener.mapRawToCandidate(record);
    return screener.screen(candidate);
  });

  // 결과 CSV 저장
  const header = Object.keys(reports[0]).join(',');
  const rows = reports.map(r => {
    return Object.values(r).map(v => {
      if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',');
  });
  fs.writeFileSync(outputPath, [header, ...rows].join('\n'));

  // 상태별 분류
  const approved = reports.filter(r => r.screening_status === 'APPROVED_CANDIDATE');
  const nearApproved = reports.filter(r => r.screening_status === 'REVIEW_ONLY' && r.review_priority === 'HIGH');
  const reviewOnly = reports.filter(r => r.screening_status === 'REVIEW_ONLY');
  const watchlist = reports.filter(r => r.screening_status === 'WATCHLIST');
  const rejected = reports.filter(r => r.screening_status === 'REJECTED');

  // 키워드별 분석
  const keywords = Array.from(new Set(reports.map(r => r.source_evidence.title.split(' ')[0] || 'Unknown')));
  const keywordStats = keywords.map(kw => {
    const kReports = reports.filter(r => r.source_evidence.title.startsWith(kw));
    const total = kReports.length;
    const app = kReports.filter(r => r.screening_status === 'APPROVED_CANDIDATE').length;
    const high = kReports.filter(r => r.screening_status === 'REVIEW_ONLY' && r.review_priority === 'HIGH').length;
    const watch = kReports.filter(r => r.screening_status === 'WATCHLIST').length;
    const rej = kReports.filter(r => r.screening_status === 'REJECTED').length;
    
    const reasons = new Map<string, number>();
    kReports.forEach(r => {
      r.rejection_reasons.forEach(reason => reasons.set(reason, (reasons.get(reason) || 0) + 1));
      if (r.review_reason_type && r.review_reason_type !== 'NONE') reasons.set(r.review_reason_type, (reasons.get(r.review_reason_type) || 0) + 1);
    });
    const topReasons = Array.from(reasons.entries()).sort((a,b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);

    let status = '⏳ 관찰중';
    if (app > 0 || high > 0) status = '✅ 확장권장';
    else if (total > 30 && rej / total > 0.9) status = '❌ 퇴출권장';

    return { keyword: kw, total, approved: app, review_high: high, watchlist: watch, rejected: rej, top_reasons: topReasons.length > 0 ? topReasons : ['NONE'], status };
  });

  await generateReports(
    reports, approved, nearApproved, reviewOnly, watchlist, rejected, keywordStats, 
    reportPath, sourcingReportPath, successPatternPath
  );

  // v3.7 Enrichment Runner 가동
  const enricher = new EvidenceEnricher();
  const enrichmentResult = enricher.enrichAll();

  if (enrichmentResult) {
    generateEnrichmentReport(enrichmentResult);
  }

  console.log('--------------------------------------------------');
  console.log('코다리 부장: "v3.7 증거 보강 러너 가동이다. 껍데기만 있는 놈들 다 걸러내!"');
  console.log('--------------------------------------------------');
  console.log(`v3.7 완료. 보강 성공 ${enrichmentResult?.success}건, 재심사 후보 ${enrichmentResult?.promotion}건.`);
}

async function generateReports(
  reports: ScreeningReport[], 
  approved: ScreeningReport[], 
  nearApproved: ScreeningReport[], 
  reviewOnly: ScreeningReport[],
  watchlist: ScreeningReport[], 
  rejected: ScreeningReport[], 
  keywordStats: any[], 
  screeningPath: string, 
  sourcingPath: string, 
  successPatternPath: string
) {
  const date = new Date().toISOString().split('T')[0];
  
  // 1. Approved Success Pattern
  if (approved.length > 0) {
    const best = approved[0];
    const bestKeyword = best.source_evidence.title.split(' ')[0] || 'Unknown';
    const patternContent = `# 🏆 APPROVED 성공 패턴 분석 (v3.7) - ${date}

## 1. 성공 상품 개요
- **상품명**: ${best.title}
- **키워드**: ${bestKeyword}
- **카테고리**: ${best.category}

## 2. APPROVED 결정 요인 (Evidence)
- **증거 품질**: ${best.detail_page_data.blockers.length === 0 ? '결함 없음 (Perfect)' : '보완 가능'}
- **공급사 신뢰도**: ${best.supplier_score}점 (${best.supplier_score_reason})
- **키워드 노출력**: ${best.visibility_score}점
- **CS 부담 지수**: ${best.cs_burden_score}점
- **최종 마진율**: ${(best.margin_rate * 100).toFixed(1)}%

---
**코다리 부장**: "증거가 확실하면 돈이 된다. 이놈들 같은 놈들만 찾아와!"
`;
    fs.writeFileSync(successPatternPath, patternContent.trim());
  }

  // 2. evidence_enrichment_queue.csv (v3.6 구조 유지)
  const enrichmentQueue: EvidenceEnrichmentQueue[] = nearApproved.map(item => ({
    product_id: item.productId,
    product_name: item.title,
    source_url: item.source_url,
    review_reason_type: item.review_reason_type || 'DETAIL_PAGE_NEEDS_WORK',
    missing_evidence_fields: (item.missing_evidence_fields || []).join(' | '),
    required_action: item.review_reason_type === 'SPEC_MISSING' ? '나사 규격 상세 확인 (1/4, 3/8)' : '옵션/구성품 및 마진 재검토',
    current_screening_status: item.screening_status,
    target_status_after_enrichment: 'APPROVED_CANDIDATE',
    human_check_required: true,
    memo: ''
  }));

  const enrichmentHeader = 'product_id,product_name,source_url,review_reason_type,missing_evidence_fields,required_action,current_screening_status,target_status_after_enrichment,human_check_required,memo\n';
  const enrichmentRows = enrichmentQueue.map(q => 
    `"${q.product_id}","${q.product_name.replace(/"/g, '""')}","${q.source_url}","${q.review_reason_type}","${q.missing_evidence_fields}","${q.required_action}","${q.current_screening_status}","${q.target_status_after_enrichment}",${q.human_check_required},"${q.memo}"`
  ).join('\n');
  fs.writeFileSync('data/evidence_enrichment_queue.csv', enrichmentHeader + enrichmentRows);

  // 3. expanded_seed_keywords.csv (active=false 유지)
  const expandedKeywords: ExpandedKeyword[] = [];
  if (approved.length > 0) {
    const best = approved[0];
    const bestKeyword = best.source_evidence.title.split(' ')[0] || 'Unknown';
    expandedKeywords.push({
      parent_keyword: (best as any).collected_keyword || 'Unknown',
      expanded_keyword: `${bestKeyword} screw adapter`,
      reason: 'APPROVED 성공 패턴 계열 확장',
      expected_category: best.category,
      risk_expectation: 'LOW',
      cs_risk_expectation: 'MEDIUM',
      active: false,
      test_limit: 20
    });
  }

  const keywordHeader = 'parent_keyword,expanded_keyword,reason,expected_category,risk_expectation,cs_risk_expectation,active,test_limit\n';
  const keywordRows = expandedKeywords.map(k => 
    `"${k.parent_keyword}","${k.expanded_keyword}","${k.reason}","${k.expected_category}","${k.risk_expectation}","${k.cs_risk_expectation}",${k.active},${k.test_limit}`
  ).join('\n');
  fs.writeFileSync('data/expanded_seed_keywords.csv', keywordHeader + keywordRows);

  // 4. Sourcing Report
  let sourcingContent = `# 📡 자동 상품 소싱 보고서 (v3.7) - ${date}

## 1. 지능형 소싱 퍼널 (V3.7 Funnel)
- **총 심사 대상**: ${reports.length}건
  - **APPROVED Pool**: ${approved.length}건
  - **Review HIGH Pool**: ${nearApproved.length}건
  - **Watchlist/Rejected**: ${watchlist.length + rejected.length}건

## 2. v3.7 증거 보강 실적 (Runner Stats)
- **보강 시도**: ${nearApproved.length}건
- **보강 성공(Enriched)**: TBD (Runner 실행 후 확인)
- **재심사 후보(Promotion)**: TBD

## 3. 키워드별 세부 퍼포먼스
| 키워드 | 수집 | 승인 | 검토(HIGH) | 관찰 | 탈락 | TOP 사유 | 판정 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;
  for (const s of keywordStats) {
    sourcingContent += `| ${s.keyword} | ${s.total} | ${s.approved} | ${s.review_high} | ${s.watchlist} | ${s.rejected} | ${s.top_reasons.join(', ')} | ${s.status} |\n`;
  }

  sourcingContent += `\n---
**코다리 부장**: "증거 보강 큐에 넣었다고 끝난 게 아냐. 실제로 데이터가 채워져야 돈이 된다."\n`;
  fs.writeFileSync(sourcingPath, sourcingContent.trim());
}

function generateEnrichmentReport(result: { total: number, success: number, failed: number, promotion: number }) {
  const date = new Date().toISOString().split('T')[0];
  const enriched = fs.existsSync('data/enriched_candidates.csv') ? parse(fs.readFileSync('data/enriched_candidates.csv', 'utf-8'), { columns: true }) : [];
  const failed = fs.existsSync('data/enrichment_failed_candidates.csv') ? parse(fs.readFileSync('data/enrichment_failed_candidates.csv', 'utf-8'), { columns: true }) : [];

  const topMissing = new Map<string, number>();
  (enriched as EnrichedCandidate[]).forEach(e => {
    e.still_missing_fields.split(' | ').forEach(f => { if (f) topMissing.set(f, (topMissing.get(f) || 0) + 1); });
  });

  const report = `# 🛠️ 증거 보강 러너 실적 리포트 (v3.7) - ${date}

## 1. 보강 실행 요약
- **보강 대상 총 수**: ${result.total}건
- **보강 성공 (Enriched)**: ${result.success}건
- **보강 실패 (Failed)**: ${result.failed}건
- **재심사 후보 (Promotion)**: ${result.promotion}건
- **P100 락 상태**: **LOCKED**

## 2. 증거 품질 분석
- **가장 많이 보강된 증거**: source_option_name, source_spec_text
- **여전히 부족한 증거 TOP 3**: ${Array.from(topMissing.entries()).sort((a,b) => b[1]-a[1]).slice(0,3).map(e => e[0]).join(', ') || '없음'}

## 3. 재심사 대기 상품 (Promotion Candidates)
${(enriched as EnrichedCandidate[]).filter(e => e.promotion_candidate).slice(0, 5).map(e => `- **${e.product_name}** (${e.product_id}) - 신뢰도: ${e.evidence_confidence_summary}`).join('\n')}

## 4. 보강 실패 및 드랍 권고 (Failed)
${(failed as EnrichmentFailedCandidate[]).slice(0, 3).map(e => `- **${e.product_name}**: ${e.failure_reason}`).join('\n')}

---
**코다리 부장**: "재심사 후보라고 다 APPROVED가 되는 게 아냐. 다시 한번 현미경 들이대고 검사할 거니까 긴장해!"
`;
  fs.writeFileSync('reports/evidence_enrichment_runner_report.md', report);
}

function getTopReasons(reports: ScreeningReport[], field: 'review_reason_type' | 'watchlist_reason_type'): string {
  const map: Record<string, number> = {};
  reports.forEach(r => {
    const val = r[field];
    if (val && val !== 'NONE') map[val] = (map[val] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}(${v})`).join(', ') || '없음';
}

main().catch(err => console.error(err));
