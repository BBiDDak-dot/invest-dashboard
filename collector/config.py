"""수집할 경제지표 목록. 필요한 지표는 여기에 추가함."""

# FRED 시리즈 ID: https://fred.stlouisfed.org 에서 검색
FRED_SERIES = [
    ("DGS10", "미국 10년물 국채금리", "%"),
    ("FEDFUNDS", "미국 기준금리", "%"),
    ("T10YIE", "미국 10년 기대인플레이션(BEI)", "%"),
    # 하이퍼스케일러 CDS는 무료 공개 데이터가 없어 신용등급별 회사채 스프레드로 대신함
    # AA: MSFT·GOOGL·AMZN·META 수준, BBB: ORCL 수준
    ("BAMLC0A2CAA", "AA등급 회사채 스프레드 (CDS 대용)", "%p"),
    ("BAMLC0A4CBBB", "BBB등급 회사채 스프레드 (CDS 대용)", "%p"),
    # 관심종목 화면 상단 환율 표시용 (경제지표 화면에서는 숨김)
    ("DEXKOUS", "원/달러 환율", "원"),
]
