from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ._serialise import Serializable, ref_name


@dataclass(frozen=True)
class Link(Serializable):
    selection: object
    target: object
    action: Literal["filter", "highlight", "skip", "color"] | None = "highlight"

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {
            "selection": ref_name(self.selection),
            "target": ref_name(self.target),
        }
        if self.action is not None:
            out["action"] = self.action
        return out
