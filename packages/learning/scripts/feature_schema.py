FEATURE_KEYS = [
    "industry_key",
    "source",
    "window_rule",
    "window_days",
    "coverage_ratio",
    "mapping_confidence_level",
    "missingness_score",
    "quotes_count",
    "invoices_count",
    "paid_invoices_count",
    "calendar_events_count",
    "active_days_count",
    "quotes_per_active_day",
    "invoices_per_active_day",
    "paid_invoice_rate",
    "quote_to_invoice_rate",
    "has_quotes",
    "has_invoices",
    "has_calendar",
    "decision_lag_days_p50",
    "decision_lag_days_p90",
    "approved_to_scheduled_days_p50",
    "approved_to_scheduled_days_p90",
    "invoiced_to_paid_days_p50",
    "invoiced_to_paid_days_p90",
    "has_decision_lag",
    "has_approved_to_scheduled",
    "has_invoiced_to_paid",
    "invoice_total_sum_log",
    "invoice_total_p50_log",
    "invoice_total_p90_log",
    "top1_invoice_share",
    "top5_invoice_share",
    "gini_proxy",
    "mid_ticket_share",
    "has_amounts",
    "weekly_volume_mean",
    "weekly_volume_cv",
    "seasonality_strength",
    "has_rhythm",
    "open_quotes_count",
    "open_quotes_share",
    "has_open_quotes",
    "excluded_quotes_outside_window",
    "excluded_invoices_outside_window",
    "excluded_calendar_outside_window",
    "excluded_ratio",
    "date_parse_error_rate",
]

STRING_ENCODERS = {
    "industry_key": {
        "unknown": 0,
        "hvac": 1,
        "plumbing": 2,
        "electrical": 3,
        "landscaping": 4,
        "cleaning": 5,
    },
    "source": {"mock": 0, "real": 1},
    "window_rule": {"last_90_days": 0, "cap_100_closed": 1, "last_12_months": 2, "custom": 3},
}


def encode_value(key, value):
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        mapping = STRING_ENCODERS.get(key)
        if mapping is not None:
            return float(mapping.get(value, 0))
        return 0.0
    return 0.0


def vectorize_features(features):
    return [encode_value(key, features.get(key)) for key in FEATURE_KEYS]
