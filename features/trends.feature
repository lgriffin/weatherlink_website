Feature: View trend charts

  Scenario: View temperature over the last 7 days
    Given observations exist for the last 7 days
    When I view the temperature trend for the last 7 days
    Then I should see a line chart with temperature data
    And the chart should identify timezone, units, and period
