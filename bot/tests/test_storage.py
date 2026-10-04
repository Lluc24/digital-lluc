"""Run from bot/: uv run python -m unittest discover -s tests -v"""

import asyncio
import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import storage  # noqa: E402

REDIS_ENV = {"UPSTASH_REDIS_REST_URL": "https://redis.test", "UPSTASH_REDIS_REST_TOKEN": "tok"}


def run(coro):
    return asyncio.run(coro)


def client_with(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


class RecordSessionTests(unittest.TestCase):
    def test_unconfigured_redis_is_a_noop(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertFalse(run(storage.record_session("s1", {"userId": "u"})))

    def test_writes_hash_then_index(self):
        calls = []

        def handler(request):
            calls.append(json.loads(request.content))
            return httpx.Response(200, json={"result": 1})

        async def go():
            async with client_with(handler) as client:
                return await storage.record_session("s1", {"userId": "u", "durationSecs": 3}, client=client)

        with mock.patch.dict(os.environ, REDIS_ENV, clear=True):
            self.assertTrue(run(go()))
        self.assertEqual(calls[0], ["HSET", "session:s1", "userId", "u", "durationSecs", "3"])
        self.assertEqual(calls[1][:2], ["ZADD", "sessions:index"])
        self.assertEqual(calls[1][3], "s1")

    def test_failed_hash_write_skips_the_index(self):
        calls = []

        def handler(request):
            calls.append(json.loads(request.content)[0])
            return httpx.Response(400, json={"error": "ERR bad"})

        async def go():
            async with client_with(handler) as client:
                return await storage.record_session("s1", {"userId": "u"}, client=client)

        with mock.patch.dict(os.environ, REDIS_ENV, clear=True):
            self.assertFalse(run(go()))
        self.assertEqual(calls, ["HSET"])

    def test_network_error_is_logged_not_raised(self):
        def handler(request):
            raise httpx.ConnectError("down")

        async def go():
            async with client_with(handler) as client:
                return await storage.record_session("s1", {"userId": "u"}, client=client)

        with mock.patch.dict(os.environ, REDIS_ENV, clear=True):
            self.assertFalse(run(go()))


class UploadBlobTests(unittest.TestCase):
    def test_unconfigured_blob_returns_none(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(run(storage.upload_blob("a.json", b"x", "application/json")))

    def test_returns_pathname_on_success(self):
        put = mock.AsyncMock(return_value=SimpleNamespace(pathname="a.json"))
        with mock.patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN": "t"}, clear=True), mock.patch.object(
            storage, "put_async", put
        ):
            self.assertEqual(run(storage.upload_blob("a.json", b"x", "application/json")), "a.json")
        put.assert_awaited_once()

    def test_upload_failure_returns_none_instead_of_raising(self):
        put = mock.AsyncMock(side_effect=RuntimeError("boom"))
        with mock.patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN": "t"}, clear=True), mock.patch.object(
            storage, "put_async", put
        ):
            self.assertIsNone(run(storage.upload_blob("a.json", b"x", "application/json")))


if __name__ == "__main__":
    unittest.main()
