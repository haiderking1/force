import json
import tempfile
import unittest
from pathlib import Path
from force_unity.merge import merge_stages
from force_unity.paths import digest,write_json


class MergeTests(unittest.TestCase):
    def test_merge_keeps_approval_disabled_and_rejects_conflicting_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);game=root/"game";game.mkdir()
            stages=[]
            for number in range(2):
                name=f"file{number}";stage=root/f"stage{number}";(stage/"files").mkdir(parents=True)
                (game/name).write_bytes(b"original");(stage/"files"/name).write_bytes(b"new")
                write_json(stage/"stage.json",{"schemaVersion":1,"engine":"unity","root":str(game),"processNames":["Fixture"],
                    "files":[{"path":name,"originalSha256":digest(b"original"),"stagedSha256":digest(b"new")}],"installReady":True})
                stages.append(stage)
            merge_stages(stages,root/"combined")
            result=json.loads((root/"combined/stage.json").read_text())
            self.assertEqual(len(result["files"]),2);self.assertFalse(result["installReady"])
            conflicting=root/"conflict";(conflicting/"files").mkdir(parents=True)
            manifest=json.loads((stages[0]/"stage.json").read_text());manifest["files"][0]["stagedSha256"]=digest(b"different")
            (conflicting/"files/file0").write_bytes(b"different");write_json(conflicting/"stage.json",manifest)
            with self.assertRaises(ValueError):merge_stages([stages[0],conflicting],root/"rejected")
            self.assertFalse((root/"rejected").exists())


if __name__ == "__main__":unittest.main()
