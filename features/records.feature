Feature: Rank historical daily maximums

  Scenario: Exclude an incomplete day from record ranking
    Given July 17, 2024 has 35 percent completeness
    And July 17, 2025 has 98 percent completeness
    When I rank July 17 by maximum temperature
    Then the 2024 value should be displayed
    But the 2024 value should be marked incomplete
    And the 2024 value should not be declared the record
