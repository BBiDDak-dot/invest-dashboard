import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro, isSentiment } from "@/lib/queries";

export default async function MacroPage() {
  const rows = await getMacro();
  return (
    <>
      <SetupNotice />
      <Card title="경제 지표 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => !isSentiment(r.series_id))} />
      </Card>
      <Card title="심리 지표 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isSentiment(r.series_id))} />
        <p className="mt-3 text-xs text-zinc-400">
          공포탐욕지수: 0에 가까울수록 공포, 100에 가까울수록 탐욕 (25 이하 극단적 공포, 75 이상 극단적 탐욕). 미국은 CNN 지수. NASDAQ·KOSPI·KOSDAQ은
          공개 지수가 없어 CNN 방식을 줄여 직접 계산함: 125일 이동평균 대비 괴리, 52주 고저 범위 안의 위치, RSI(14), 변동성(NASDAQ은 VXN)을 각각
          최근 1년 백분위로 바꿔 평균. 신용융자 잔고는 금융투자협회 자료.
        </p>
      </Card>
    </>
  );
}
