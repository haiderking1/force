import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from force_unity.paths import digest, confined, write_json
from force_unity.install.commands import apply, restore
from force_unity.install import transaction


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.game,self.stage,self.backup = (self.root/n for n in ("game","stage","backup"))
        self.game.mkdir();(self.stage/"files").mkdir(parents=True)
        self.rows=[]
        for name in ("one","two"):
            (self.game/name).write_bytes(b"original")
            (self.stage/"files"/name).write_bytes(b"replacement")
            self.rows.append({"path":name,"originalSha256":digest(b"original"),"stagedSha256":digest(b"replacement")})
        self.manifest={"schemaVersion":1,"root":str(self.game),"installReady":True,
                       "processNames":["ForceFixtureNeverRunning"],"files":self.rows}
        write_json(self.stage/"stage.json",self.manifest)

    def test_verified_apply_and_restore(self):
        with patch("force_unity.install.commands.assert_closed"):
            apply(self.stage,self.backup,True)
            self.assertEqual((self.game/"one").read_bytes(),b"replacement")
            self.assertEqual((self.backup/"files/one").read_bytes(),b"original")
            restore(self.backup,True)
            self.assertEqual((self.game/"two").read_bytes(),b"original")

    def test_confirmation_and_unapproved_stage_refused(self):
        with self.assertRaises(ValueError):apply(self.stage,self.backup)
        self.manifest["installReady"]=False;write_json(self.stage/"stage.json",self.manifest)
        with self.assertRaises(ValueError):apply(self.stage,self.backup,True)
        self.assertFalse(self.backup.exists())

    def test_mid_install_failure_rolls_back_all_files(self):
        real=transaction.os.replace
        calls=0
        def fail_second(source,dest):
            nonlocal calls
            if ".force-" in str(source):
                calls+=1
                if calls==2:raise OSError("simulated rename failure")
            return real(source,dest)
        with patch("force_unity.install.commands.assert_closed"),patch.object(transaction.os,"replace",side_effect=fail_second):
            with self.assertRaises(OSError):apply(self.stage,self.backup,True)
        for name in ("one","two"):self.assertEqual((self.game/name).read_bytes(),b"original")
        self.assertEqual(json.loads((self.backup/"backup.json").read_text())["state"],"rolled-back")

    def test_changed_game_and_corrupt_backup_refused(self):
        with patch("force_unity.install.commands.assert_closed"):
            (self.game/"one").write_bytes(b"changed")
            with self.assertRaises(ValueError):apply(self.stage,self.backup,True)
            (self.game/"one").write_bytes(b"original")
            apply(self.stage,self.backup,True)
            (self.backup/"files/one").write_bytes(b"tampered")
            with self.assertRaises(ValueError):restore(self.backup,True)
        self.assertEqual((self.game/"two").read_bytes(),b"replacement")

    def test_traversal_and_symlink_escape(self):
        for relative in ("../outside","/absolute","C:\\absolute","a/../../b"):
            with self.assertRaises(ValueError):confined(self.game,relative)
        (self.game/"link").symlink_to(self.stage,target_is_directory=True)
        with self.assertRaises(ValueError):confined(self.game,"link/files/one")


if __name__ == "__main__":unittest.main()
