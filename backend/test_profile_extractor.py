import unittest
from profile_extractor import detect_visa_category, extract_profile


class ProfileExtractorTests(unittest.TestCase):
    def test_i20_f1_and_f2_admission_classes(self):
        self.assertEqual(detect_visa_category("Form I-20\nClass of Admission: F-1")["detected_visa_type"], "F1")
        self.assertEqual(detect_visa_category("Form I-20\nClass of Admission: F-2")["detected_visa_type"], "F2")

    def test_ds160_b1_b2_purpose_wording(self):
        result = detect_visa_category("Online Nonimmigrant Visa Application\nPurpose of Trip to the U.S. TEMP. BUSINESS OR PLEASURE VISITOR (B)")
        self.assertEqual(result["detected_visa_type"], "B1/B2")

    def test_ds160_dependent_and_worker_categories(self):
        self.assertEqual(detect_visa_category("Spouse/Child of an H1B (H4)")["detected_visa_type"], "H4")
        self.assertEqual(detect_visa_category("Temporary Worker in Specialty Occupation (H1B)")["detected_visa_type"], "H1B")

    def test_inline_and_wrapped_values_are_extracted(self):
        text = """
Online Nonimmigrant Visa Application
Full Name: Jane Doe
Purpose of Trip to the U.S. TEMP. BUSINESS OR PLEASURE VISITOR (B)
Intended Length of Stay: 14 days
Person/Entity Paying for Your Trip Self
"""
        profile = extract_profile(text)
        self.assertEqual(profile.get("applicant_name"), "Jane Doe")
        self.assertIn("BUSINESS OR PLEASURE", profile.get("travel_purpose", ""))
        self.assertEqual(profile.get("travel_duration"), "14 days")
        self.assertEqual(profile.get("trip_payer"), "Self")


if __name__ == "__main__":
    unittest.main()
