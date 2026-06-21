import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pearl_dashboard_agent as agent


class AgentParsingTest(unittest.TestCase):
    def test_parse_nvidia_smi_csv(self):
        output = (
            "0, NVIDIA GeForce RTX 4090, 99, 66, 312.40, 11220, 24564\n"
            "1, NVIDIA GeForce RTX 4090, 98, 69, 305.20, 11221, 24564\n"
        )

        gpus = agent.parse_nvidia_smi_csv(output)

        self.assertEqual(len(gpus), 2)
        self.assertEqual(gpus[0]["index"], 0)
        self.assertEqual(gpus[0]["temperature_c"], 66)
        self.assertEqual(gpus[1]["utilization_pct"], 98)

    def test_parse_number_handles_na(self):
        self.assertEqual(agent.parse_number("N/A"), 0)
        self.assertEqual(agent.parse_number("[Not Supported]"), 0)


if __name__ == "__main__":
    unittest.main()
