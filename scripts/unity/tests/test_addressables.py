import base64
import json
import struct
import unittest
from force_unity.addressables import patch_catalog,decode_options


def option(crc):
    assembly=b"Unity.ResourceManager"
    cls=b"UnityEngine.ResourceManagement.ResourceProviders.AssetBundleRequestOptions"
    data=json.dumps({"m_Crc":crc,"m_Hash":"","m_BundleSize":2,"keep":True}).encode("utf-16-le")
    return bytes([7,len(assembly)])+assembly+bytes([len(cls)])+cls+struct.pack("<i",len(data))+data


class AddressablesTests(unittest.TestCase):
    def fixture(self):
        a,b=option(123),option(0)
        entries=struct.pack("<i",2)+struct.pack("<7i",0,0,-1,99,0,0,0)+struct.pack("<7i",1,0,-1,88,len(a),1,0)
        return {"m_InternalIds":["a.bundle","b.bundle"],"m_EntryDataString":base64.b64encode(entries).decode(),
                "m_ExtraDataString":base64.b64encode(a+b).decode(),"keep":"unchanged"}

    def test_crc_cache_key_and_offsets_update_without_touching_other_options(self):
        source=self.fixture()
        result=patch_catalog(source,{"a.bundle":{"oldCrc":123,"crc":4444,"hash":"a"*32,"size":987654}})
        entries=base64.b64decode(result["m_EntryDataString"]);extra=base64.b64decode(result["m_ExtraDataString"])
        first=decode_options(extra,0)[0]
        second_offset=struct.unpack_from("<i",entries,4+28+16)[0]
        second=decode_options(extra,second_offset)[0]
        self.assertEqual(first["m_Crc"],4444);self.assertEqual(first["m_BundleSize"],987654)
        self.assertTrue(first["keep"]);self.assertEqual(second,decode_options(base64.b64decode(source["m_ExtraDataString"]),len(option(123)))[0])
        self.assertEqual(result["keep"],"unchanged");self.assertEqual(source,self.fixture())

    def test_stale_crc_and_missing_bundle_fail(self):
        with self.assertRaises(ValueError):patch_catalog(self.fixture(),{"a.bundle":{"oldCrc":1,"crc":2,"hash":"b"*32,"size":1}})
        with self.assertRaises(ValueError):patch_catalog(self.fixture(),{"missing":{"oldCrc":1,"crc":2,"hash":"b"*32,"size":1}})


if __name__ == "__main__":unittest.main()
