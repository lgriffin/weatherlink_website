Feature: Synchronize WeatherLink history

  Scenario: Split a multi-day backfill into valid requests
    Given I request three complete days of historical data
    When the synchronization plan is created
    Then every request window should satisfy the WeatherLink API limit
    And the windows should cover the range without gaps
    And the windows should not overlap

  Scenario: Resume after the container restarts
    Given five historical synchronization windows are complete
    And the sixth window is pending
    When the service restarts
    Then the first five windows should not be downloaded again
    And synchronization should resume from the sixth window
