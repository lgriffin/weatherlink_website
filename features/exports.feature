Feature: Download a trend chart

  Scenario: Export monthly rainfall as SVG
    Given I am viewing daily rainfall for July 2026
    When I download the chart as SVG
    Then the file should contain the chart title
    And it should identify the period as July 2026
    And it should identify rainfall units as millimetres
