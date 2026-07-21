Feature: Compare a calendar date across years

  Scenario: Compare today using the same local-time cutoff
    Given complete observations exist for July 17 in 2023, 2024 and 2025
    And observations exist for July 17, 2026 up to 14:00 local time
    When I compare July 17 using the same-time option
    Then each prior year should be calculated only through 14:00 local time
    And I should see maximum temperature for each year
    And I should see rainfall for each year
    And the 2026 result should be provisional
