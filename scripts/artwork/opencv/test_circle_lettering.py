import unittest
import cv2
import numpy as np
from circle_lettering import locate, repaint


class CircleLetteringTests(unittest.TestCase):
    def test_detects_red_sticker_and_preserves_surroundings(self):
        frame = np.full((240,320,3), 30, np.uint8)
        cv2.circle(frame, (160,120), 50, (70,80,240), -1)
        cv2.putText(frame, "START", (130,125), cv2.FONT_HERSHEY_SIMPLEX, .4, (10,10,10), 1)
        ellipse = locate(frame, [90,50,230,190])
        self.assertAlmostEqual(ellipse[0][0],160,delta=1)
        self.assertAlmostEqual(ellipse[0][1],120,delta=1)
        lettering = np.zeros((30,60,4),np.uint8)
        lettering[5:25,5:55] = (10,10,10,255)
        result, evidence = repaint(frame, lettering, ellipse)
        yy, xx = np.indices(frame.shape[:2])
        outside = (xx-160)**2 + (yy-120)**2 > 51**2
        np.testing.assert_array_equal(result[outside],frame[outside])
        self.assertGreater(evidence["letteringPixels"],0)
        self.assertFalse(evidence["motionBlurApplied"])

    def test_missing_sticker_is_not_silently_hidden(self):
        with self.assertRaises(ValueError):
            locate(np.zeros((100,100,3),np.uint8),[0,0,100,100])


if __name__ == "__main__":
    unittest.main()
