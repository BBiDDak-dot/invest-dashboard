// 지수 12M Fwd PER·PBR 출처·계산 방법 안내
export function ValuationNote() {
  return (
    <p className="mt-3 text-xs text-zinc-400">
      KOSPI·KOSDAQ: 공개 지수 값이 없어 직접 계산함. 시총 상위 KOSPI 200·KOSDAQ 150 종목 중 컨센서스가 있는 종목의 12M Fwd EPS·BPS(와이즈리포트
      올해·내년 추정치를 남은 기간 비율로 섞음)를 모아 시총 합 ÷ 예상 순이익 합(PER), 시총 합 ÷ 예상 자본 합(PBR). 과거 컨센서스 이력은 무료 출처가
      없어 2026-11부터 쌓임. S&P 500: FactSet Earnings Insight 주간 값. NASDAQ 100: WSJ(Birinyi Associates) 주간 추정 PER, 2026-11부터 쌓임.
      미국 지수 12M Fwd PBR은 무료 출처가 없어 뺌.
    </p>
  );
}
