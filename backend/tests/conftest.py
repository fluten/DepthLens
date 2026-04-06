"""pytest 共享配置 — 把 backend/ 加入 sys.path + autouse 单例重置 fixture.

任何 ``test_*.py`` 都会自动应用本文件里的 fixture (无需 import).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# 把 backend/ 加入 sys.path, 让 ``from app...`` 可用 (与各 test 文件里的
# 行内 sys.path.insert 等价, 集中到这里).
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import depth_service, model_manager  # noqa: E402


@pytest.fixture(autouse=True)
def reset_singletons():
    """每个测试开始 / 结束都重置全部模块级单例, 防止跨测试污染.

    这是 autouse 的, 所以所有 test_*.py 都会自动应用. ``reset_*_for_tests``
    在单例尚未创建时是 no-op, 因此对纯函数测试 (test_depth_utils, test_smoke)
    无副作用.
    """
    model_manager.reset_model_manager_for_tests()
    depth_service.reset_depth_service_for_tests()
    yield
    model_manager.reset_model_manager_for_tests()
    depth_service.reset_depth_service_for_tests()
