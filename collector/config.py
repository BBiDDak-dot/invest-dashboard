"""수집할 투자 지표 목록. 필요한 지표는 여기에 추가함."""

# (FRED 시리즈 ID, 이름, 단위, 변환)  https://fred.stlouisfed.org 에서 검색
# 변환: None=원값, "pc1"=전년 동월 대비 변화율(%)
FRED_SERIES = [
    ("DFEDTARU", "미국 기준금리 (목표 상단)", "%", None),
    ("T10YIE", "미국 10년 기대인플레이션(BEI)", "%", None),
    ("CPILFESL", "미국 Core CPI (전년 대비)", "%", "pc1"),
]

# FRED는 환율·유가·국채금리가 며칠~1주 늦게 올라와서 Yahoo 일별 종가를 씀
# (Yahoo 심볼, 이름, 단위)
YAHOO_SERIES = [
    ("^TNX", "미국 10년물 국채금리", "%"),
    ("CL=F", "WTI 유가 (근월물)", "달러/배럴"),
    ("KRW=X", "원/달러 환율", "원"),
]
