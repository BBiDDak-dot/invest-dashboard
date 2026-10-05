"""수집할 투자 지표 목록. 필요한 지표는 여기에 추가함."""

# (FRED 시리즈 ID, 이름, 단위, 변환)  https://fred.stlouisfed.org 에서 검색
# 변환: None=원값, "pc1"=전년 동월 대비 변화율(%)
FRED_SERIES = [
    ("DGS10", "미국 10년물 국채금리", "%", None),
    ("FEDFUNDS", "미국 기준금리", "%", None),
    ("T10YIE", "미국 10년 기대인플레이션(BEI)", "%", None),
    ("CPILFESL", "미국 Core CPI (전년 대비)", "%", "pc1"),
    ("DCOILWTICO", "WTI 유가", "달러/배럴", None),
    ("DEXKOUS", "원/달러 환율", "원", None),
]
