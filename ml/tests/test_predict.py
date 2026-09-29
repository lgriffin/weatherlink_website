from wxml.predict import forecast


def test_forecast_from_saved_models(synthetic_db, trained):
    out, _ = trained
    result = forecast(synthetic_db, out / 'models')
    evening = result['evening']
    assert 0 <= evening['frost_chance'] <= 1
    low, high = evening['night_min_range']
    assert low <= evening['night_min'] <= high
    assert 0 <= result['latest_hour']['rain_next_6h_chance'] <= 1
    assert result['brief'].startswith(f"Issued {evening['date']} 18:00.")
    assert 'Model: overnight low' in result['brief']
