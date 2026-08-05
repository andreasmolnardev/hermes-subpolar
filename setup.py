"""
setup.py — wheel/sdist build guard.

pip/PyPI and Homebrew are no longer supported distribution methods for
Hermes Agent (see website/docs/getting-started/platform-support.md). The
wheel would ship without bundled assets (locales, skills, optional-mcps,
web_dist, tui_dist, plugin manifests) since those are resolved at runtime
via environment-variable overrides or the source-checkout layout.

This file overrides the ``bdist_wheel`` and ``sdist`` setuptools commands
to raise an error. The PEP 517
``build_wheel`` / ``build_sdist`` hooks in
``setuptools.build_meta`` call these commands internally, so the guard
fires for ``uv build``, ``pip wheel``, ``python -m build``, and direct
``setup.py`` invocations alike.

Editable installs (``uv sync``, ``pip install -e .``) use
``build_editable``, which does NOT call ``bdist_wheel`` — it calls
``build_ext`` in editable mode. So the guard does not affect development.
"""

from setuptools import setup
from setuptools.command.sdist import sdist

_BLOCK_MESSAGE = (
    "Building wheels or sdists for hermes-agent is not supported.\n"
    "Hermes is distributed via the Docker image.\n"
    "See: https://hermes-agent.nousresearch.com/docs/getting-started/installation\n"
    "\n"
    "If you are developing, use an editable install instead:\n"
    "  uv sync          # or: uv pip install -e .\n"
    "\n"
)


class _GuardedSdist(sdist):
    def run(self, *args, **kwargs):
        raise RuntimeError(_BLOCK_MESSAGE)


cmdclass = {"sdist": _GuardedSdist}

# bdist_wheel is only available when the `wheel` package is installed.
# setuptools.build_meta.build_wheel() calls it internally, so the guard
# fires for all PEP 517 wheel build paths. Define the subclass only when
# the import succeeds — otherwise a None base class raises TypeError at
# class-definition time, before the cmdclass guard can run.
try:
    from setuptools.command.bdist_wheel import bdist_wheel

    class _GuardedBdistWheel(bdist_wheel):
        def run(self, *args, **kwargs):
            raise RuntimeError(_BLOCK_MESSAGE)

    cmdclass["bdist_wheel"] = _GuardedBdistWheel
except ImportError:
    pass

setup(cmdclass=cmdclass)
