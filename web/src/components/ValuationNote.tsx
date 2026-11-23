// 지수 PER·PBR 출처·계산 방법 안내
export function ValuationNote() {
  return (
    <div className="mt-3 space-y-1 text-xs text-zinc-400">
      <p>
        12M Fwd(앞으로 12개월 예상 실적 기준). KOSPI·KOSDAQ: 공개 지수 값이 없어 직접 계산함. 시총 상위 KOSPI 200·KOSDAQ 150 종목 중 컨센서스가 있는
        종목의 12M Fwd EPS·BPS(와이즈리포트 올해·내년 추정치를 남은 기간 비율로 섞음)를 모아 시총 합 ÷ 예상 순이익 합(PER), 시총 합 ÷ 예상 자본 합(PBR).
        과거 컨센서스 이력은 무료 출처가 없어 2026-11부터 쌓임. S&P 500: FactSet Earnings Insight 주간 값. NASDAQ 100: WSJ(Birinyi Associates) 주간 추정
        PER, 2026-11부터 쌓임. 미국 지수 12M Fwd PBR은 무료 출처가 없어 뺌.
      </p>
      <p>
        Trailing(이미 발표된 실적 기준). KOSPI·KOSDAQ: KRX 지수 PER은 로그인이 필요해 같은 종목으로 KRX 방식처럼 직접 계산함. 직전 사업연도 확정
        지배순이익·자본(결산 90일 뒤, 12월 결산은 4월부터 반영)으로 시총 합 ÷ 순이익 합(적자 기업 제외), 시총 합 ÷ 자본 합(자본잠식 제외). 지난 3년은 지금 종목 구성·주식 수로 주간
        종가를 거꾸로 계산한 근사치. S&P 500: multpl 월별 PER(발표 기준 TTM 이익)·분기별 PBR. NASDAQ 100: worldperatio 월별 PER. NASDAQ 100 PBR은 무료
        출처가 없어 뺌.
      </p>
    </div>
  );
}
