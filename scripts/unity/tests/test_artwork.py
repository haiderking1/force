import unittest
import numpy as np
from PIL import Image,ImageDraw
from force_unity.artwork.repaint import repaint_document

PROFILE={"mode":"purple-dark","maxGray":95,"darkContrast":12,"purpleContrast":8,"kernelSize":35,"dilate":5,"radius":5}


class ArtworkTests(unittest.TestCase):
    def test_explicit_region_and_source_alpha_are_preserved(self):
        source=Image.new("RGBA",(160,100),(225,215,190,255));draw=ImageDraw.Draw(source)
        draw.rectangle((50,35,57,65),fill=(98,25,81,255));draw.rectangle((80,35,87,65),fill=(20,10,15,255))
        draw.rectangle((0,0,10,10),fill=(98,25,81,0))
        label=Image.new("RGBA",(20,12),(98,25,81,255))
        result,mask,count=repaint_document(source,label,[35,20,120,80],PROFILE)
        before,after=np.array(source),np.array(result)
        self.assertTrue(np.array_equal(before[:,:,3],after[:,:,3]))
        self.assertTrue(np.array_equal(before[:20],after[:20]))
        self.assertGreater(count,100);self.assertGreater(np.count_nonzero(before!=after),0)
        self.assertEqual(np.array(mask)[:20].sum(),0)

    def test_missing_ink_or_invalid_region_fails(self):
        source=Image.new("RGBA",(100,100),(225,215,190,255))
        with self.assertRaises(ValueError):repaint_document(source,source,[10,10,90,90],PROFILE)
        with self.assertRaises(ValueError):repaint_document(source,source,[-1,10,90,90],PROFILE)


if __name__ == "__main__":unittest.main()
