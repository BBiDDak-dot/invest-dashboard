"""수집할 경제지표 목록. 필요한 지표는 여기에 추가함."""

# FRED 시리즈 ID: https://fred.stlouisfed.org 에서 검색
FRED_SERIES = [
    ("DGS10", "미국 10년물 국채금리", "%"),
    ("FEDFUNDS", "미국 기준금리", "%"),
    ("CPIAUCSL", "미국 CPI", "지수"),
    ("UNRATE", "미국 실업률", "%"),
]
