Feature: View current home weather

  Scenario: Display locally stored conditions during an upstream outage
    Given a valid outdoor temperature observation was stored at "2026-07-17T21:45:00+01:00"
    And WeatherLink is unavailable
    When I open the current weather dashboard
    Then I should see the stored outdoor temperature
    And I should see the observation time "21:45"
    And the data should be marked according to its freshness
    And the dashboard should not wait for WeatherLink
