/** 示例输入对应的真实算法输出（由 api/correlation.py 生成，勿手改）。 */

import type { CorrelateResponse } from "../types";

export const EXAMPLE_RESPONSE: CorrelateResponse = {
  "steps": [
    {
      "index": 1,
      "type": "1:1",
      "left": [
        {
          "layer": 1,
          "code": "A",
          "thickness": 20
        }
      ],
      "right": [
        {
          "layer": 1,
          "code": "A",
          "thickness": 100
        }
      ],
      "left_sum": 20,
      "right_sum": 100,
      "rep_left": "A",
      "rep_right": "A",
      "thickness_diff": 80,
      "lithology_penalty": 0,
      "missing_base": null,
      "missing_thickness_double": null,
      "cost": 80,
      "cumulative_cost": 80,
      "cumulative_missing": 0,
      "cumulative_groups": 0
    },
    {
      "index": 2,
      "type": "1:0",
      "left": [
        {
          "layer": 2,
          "code": "C",
          "thickness": 25
        }
      ],
      "right": [],
      "left_sum": null,
      "right_sum": null,
      "rep_left": null,
      "rep_right": null,
      "thickness_diff": null,
      "lithology_penalty": null,
      "missing_base": 200,
      "missing_thickness_double": 50,
      "cost": 250,
      "cumulative_cost": 330,
      "cumulative_missing": 1,
      "cumulative_groups": 0
    },
    {
      "index": 3,
      "type": "2:1",
      "left": [
        {
          "layer": 3,
          "code": "B",
          "thickness": 60
        },
        {
          "layer": 4,
          "code": "B",
          "thickness": 40
        }
      ],
      "right": [
        {
          "layer": 2,
          "code": "B",
          "thickness": 95
        }
      ],
      "left_sum": 100,
      "right_sum": 95,
      "rep_left": "B",
      "rep_right": "B",
      "thickness_diff": 5,
      "lithology_penalty": 0,
      "missing_base": null,
      "missing_thickness_double": null,
      "cost": 5,
      "cumulative_cost": 335,
      "cumulative_missing": 1,
      "cumulative_groups": 1
    },
    {
      "index": 4,
      "type": "1:1",
      "left": [
        {
          "layer": 5,
          "code": "D",
          "thickness": 30
        }
      ],
      "right": [
        {
          "layer": 3,
          "code": "D",
          "thickness": 90
        }
      ],
      "left_sum": 30,
      "right_sum": 90,
      "rep_left": "D",
      "rep_right": "D",
      "thickness_diff": 60,
      "lithology_penalty": 0,
      "missing_base": null,
      "missing_thickness_double": null,
      "cost": 60,
      "cumulative_cost": 395,
      "cumulative_missing": 1,
      "cumulative_groups": 1
    },
    {
      "index": 5,
      "type": "1:2",
      "left": [
        {
          "layer": 6,
          "code": "E",
          "thickness": 200
        }
      ],
      "right": [
        {
          "layer": 4,
          "code": "E",
          "thickness": 50
        },
        {
          "layer": 5,
          "code": "E",
          "thickness": 150
        }
      ],
      "left_sum": 200,
      "right_sum": 200,
      "rep_left": "E",
      "rep_right": "E",
      "thickness_diff": 0,
      "lithology_penalty": 0,
      "missing_base": null,
      "missing_thickness_double": null,
      "cost": 0,
      "cumulative_cost": 395,
      "cumulative_missing": 1,
      "cumulative_groups": 2
    },
    {
      "index": 6,
      "type": "1:1",
      "left": [
        {
          "layer": 7,
          "code": "G",
          "thickness": 100
        }
      ],
      "right": [
        {
          "layer": 6,
          "code": "G",
          "thickness": 20
        }
      ],
      "left_sum": 100,
      "right_sum": 20,
      "rep_left": "G",
      "rep_right": "G",
      "thickness_diff": 80,
      "lithology_penalty": 0,
      "missing_base": null,
      "missing_thickness_double": null,
      "cost": 80,
      "cumulative_cost": 475,
      "cumulative_missing": 1,
      "cumulative_groups": 2
    },
    {
      "index": 7,
      "type": "0:1",
      "left": [],
      "right": [
        {
          "layer": 7,
          "code": "H",
          "thickness": 25
        }
      ],
      "left_sum": null,
      "right_sum": null,
      "rep_left": null,
      "rep_right": null,
      "thickness_diff": null,
      "lithology_penalty": null,
      "missing_base": 200,
      "missing_thickness_double": 50,
      "cost": 250,
      "cumulative_cost": 725,
      "cumulative_missing": 2,
      "cumulative_groups": 2
    }
  ],
  "totals": {
    "cost": 725,
    "missing_steps": 2,
    "group_steps": 2,
    "step_count": 7
  },
  "margins": {
    "steps": [
      {
        "index": 1,
        "cost": 25,
        "missing": -1,
        "groups": 1
      },
      {
        "index": 2,
        "cost": 15,
        "missing": -1,
        "groups": 1
      },
      {
        "index": 3,
        "cost": 15,
        "missing": -1,
        "groups": 1
      },
      {
        "index": 4,
        "cost": 15,
        "missing": -1,
        "groups": 1
      },
      {
        "index": 5,
        "cost": 100,
        "missing": 0,
        "groups": 0
      },
      {
        "index": 6,
        "cost": 25,
        "missing": -1,
        "groups": 1
      },
      {
        "index": 7,
        "cost": 25,
        "missing": -1,
        "groups": 1
      }
    ],
    "most_fragile": 2,
    "alternative": {
      "steps": [
        {
          "index": 1,
          "type": "1:1",
          "left": [
            {
              "layer": 1,
              "code": "A",
              "thickness": 20
            }
          ],
          "right": [
            {
              "layer": 1,
              "code": "A",
              "thickness": 100
            }
          ],
          "left_sum": 20,
          "right_sum": 100,
          "rep_left": "A",
          "rep_right": "A",
          "thickness_diff": 80,
          "lithology_penalty": 0,
          "missing_base": null,
          "missing_thickness_double": null,
          "cost": 80,
          "cumulative_cost": 80,
          "cumulative_missing": 0,
          "cumulative_groups": 0
        },
        {
          "index": 2,
          "type": "2:1",
          "left": [
            {
              "layer": 2,
              "code": "C",
              "thickness": 25
            },
            {
              "layer": 3,
              "code": "B",
              "thickness": 60
            }
          ],
          "right": [
            {
              "layer": 2,
              "code": "B",
              "thickness": 95
            }
          ],
          "left_sum": 85,
          "right_sum": 95,
          "rep_left": "B",
          "rep_right": "B",
          "thickness_diff": 10,
          "lithology_penalty": 0,
          "missing_base": null,
          "missing_thickness_double": null,
          "cost": 10,
          "cumulative_cost": 90,
          "cumulative_missing": 0,
          "cumulative_groups": 1
        },
        {
          "index": 3,
          "type": "2:1",
          "left": [
            {
              "layer": 4,
              "code": "B",
              "thickness": 40
            },
            {
              "layer": 5,
              "code": "D",
              "thickness": 30
            }
          ],
          "right": [
            {
              "layer": 3,
              "code": "D",
              "thickness": 90
            }
          ],
          "left_sum": 70,
          "right_sum": 90,
          "rep_left": "B",
          "rep_right": "D",
          "thickness_diff": 20,
          "lithology_penalty": 300,
          "missing_base": null,
          "missing_thickness_double": null,
          "cost": 320,
          "cumulative_cost": 410,
          "cumulative_missing": 0,
          "cumulative_groups": 2
        },
        {
          "index": 4,
          "type": "1:2",
          "left": [
            {
              "layer": 6,
              "code": "E",
              "thickness": 200
            }
          ],
          "right": [
            {
              "layer": 4,
              "code": "E",
              "thickness": 50
            },
            {
              "layer": 5,
              "code": "E",
              "thickness": 150
            }
          ],
          "left_sum": 200,
          "right_sum": 200,
          "rep_left": "E",
          "rep_right": "E",
          "thickness_diff": 0,
          "lithology_penalty": 0,
          "missing_base": null,
          "missing_thickness_double": null,
          "cost": 0,
          "cumulative_cost": 410,
          "cumulative_missing": 0,
          "cumulative_groups": 3
        },
        {
          "index": 5,
          "type": "1:1",
          "left": [
            {
              "layer": 7,
              "code": "G",
              "thickness": 100
            }
          ],
          "right": [
            {
              "layer": 6,
              "code": "G",
              "thickness": 20
            }
          ],
          "left_sum": 100,
          "right_sum": 20,
          "rep_left": "G",
          "rep_right": "G",
          "thickness_diff": 80,
          "lithology_penalty": 0,
          "missing_base": null,
          "missing_thickness_double": null,
          "cost": 80,
          "cumulative_cost": 490,
          "cumulative_missing": 0,
          "cumulative_groups": 3
        },
        {
          "index": 6,
          "type": "0:1",
          "left": [],
          "right": [
            {
              "layer": 7,
              "code": "H",
              "thickness": 25
            }
          ],
          "left_sum": null,
          "right_sum": null,
          "rep_left": null,
          "rep_right": null,
          "thickness_diff": null,
          "lithology_penalty": null,
          "missing_base": 200,
          "missing_thickness_double": 50,
          "cost": 250,
          "cumulative_cost": 740,
          "cumulative_missing": 1,
          "cumulative_groups": 3
        }
      ],
      "totals": {
        "cost": 740,
        "missing_steps": 1,
        "group_steps": 3,
        "step_count": 6
      }
    }
  }
};
