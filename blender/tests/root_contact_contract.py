"""Observed, intentional selectable-root mating interfaces for geometry tests."""


def _pairs(entries, reason):
    return {frozenset(entry): reason for entry in entries}


LEGACY_ROOT_CONTACTS = {
    **_pairs(
        (
            ("Z50II-01-001", "Z50II-01-002"),
            ("Z50II-01-001", "Z50II-01-004"),
            ("Z50II-01-001", "Z50II-01-006"),
            ("Z50II-01-001", "Z50II-01-007"),
            ("Z50II-01-001", "Z50II-02-006"),
            ("Z50II-01-003", "Z50II-02-002"),
            ("Z50II-01-003", "Z50II-02-001"),
            ("Z50II-01-003", "Z50II-02-006"),
            ("Z50II-01-006", "Z50II-02-001"),
            ("Z50II-01-007", "Z50II-02-001"),
            ("Z50II-01-006", "Z50II-01-007"),
            ("Z50II-01-008", "Z50II-02-001"),
            ("Z50II-01-008", "Z50II-02-006"),
        ),
        "structural rail, boss, or reinforcement seated in its chassis/shell land",
    ),
    **_pairs(
        (
            ("Z50II-02-001", "Z50II-02-004"),
            ("Z50II-02-001", "Z50II-02-002"),
            ("Z50II-02-001", "Z50II-02-003"),
            ("Z50II-02-001", "Z50II-02-005"),
            ("Z50II-02-001", "Z50II-02-006"),
            ("Z50II-02-002", "Z50II-02-006"),
        ),
        "overlapping shell return flange at an assembled exterior seam",
    ),
    **_pairs(
        (
            ("Z50II-02-001", "Z50II-02-013"),
            ("Z50II-02-001", "Z50II-02-016"),
            ("Z50II-02-001", "Z50II-02-017"),
            ("Z50II-02-002", "Z50II-02-011"),
            ("Z50II-02-002", "Z50II-02-012"),
            ("Z50II-02-003", "Z50II-02-013"),
            ("Z50II-02-003", "Z50II-02-014"),
        ),
        "control spindle, button skirt, or dial collar seated in its shell bore",
    ),
    **_pairs(
        (
            ("Z50II-02-004", "Z50II-02-007"),
            ("Z50II-02-005", "Z50II-02-008"),
            ("Z50II-02-005", "Z50II-02-009"),
        ),
        "door hinge/reveal seated in its surrounding cover opening",
    ),
    **_pairs(
        (
            ("Z50II-02-005", "Z50II-02-019"),
            ("Z50II-02-006", "Z50II-02-020"),
        ),
        "strap eyelet captured at its front/side-cover reinforcement land",
    ),
    frozenset(("Z50II-03-003", "Z50II-03-004")): (
        "electrical contact pins intentionally enter the insulated mount carrier"
    ),
}


TASK7_ROOT_CONTACTS = {
    **_pairs(
        (
            ("Z50II-06-001", "Z50II-06-002"),
            ("Z50II-06-001", "Z50II-06-004"),
        ),
        "EVF optical/display component captured by its tunnel lip or spindle seat",
    ),
    frozenset(("Z50II-06-005", "Z50II-06-006")): (
        "hot-shoe contact plate captured between the two shoe rails"
    ),
    frozenset(("Z50II-06-007", "Z50II-06-009")): (
        "flash-head hinge barrel rotates coaxially on its support"
    ),
    **_pairs(
        tuple((f"Z50II-08-{index:03d}", "Z50II-08-005") for index in range(1, 5)),
        "connector shell pins enter their I/O daughterboard footprints",
    ),
    **_pairs(
        (
            ("Z50II-07-001", "Z50II-07-002"),
            ("Z50II-07-002", "Z50II-07-006"),
        ),
        "closed LCD carrier/hinge land seated against its body-side stop",
    ),
    frozenset(("Z50II-08-009", "Z50II-08-018")): (
        "cable clamp deliberately bears on the routed sensor-flex surface"
    ),
    frozenset(("Z50II-02-003", "Z50II-06-005")): (
        "hot-shoe rails seat on the top-shell shoe land"
    ),
    **_pairs(
        (
            ("Z50II-02-003", "Z50II-06-001"),
            ("Z50II-02-003", "Z50II-06-004"),
        ),
        "EVF tunnel, eyepiece, or diopter captured by the top-shell optical lip",
    ),
    **_pairs(
        (
            ("Z50II-02-004", "Z50II-08-015"),
            ("Z50II-02-004", "Z50II-08-016"),
            ("Z50II-02-001", "Z50II-08-012"),
        ),
        "shell screw shaft enters its physical fastener seat",
    ),
    **_pairs(
        (
            ("Z50II-06-010", "Z50II-08-007"),
            ("Z50II-02-003", "Z50II-08-007"),
        ),
        "top flex enters its PCB connector and passes through the shell service slot",
    ),
    frozenset(("Z50II-08-005", "Z50II-08-010")): (
        "port flex end connector enters the I/O daughterboard socket"
    ),
    frozenset(("Z50II-02-003", "Z50II-06-010")): (
        "top-control PCB edge is seated under the top-shell support land"
    ),
    frozenset(("Z50II-02-001", "Z50II-06-010")): (
        "top-control PCB edge is seated on the front-shell shoulder support"
    ),
    frozenset(("Z50II-02-001", "Z50II-08-007")): (
        "top flex is dressed against the inner shell shoulder at its service bend"
    ),
}


ALLOWED_ROOT_CONTACTS = {**LEGACY_ROOT_CONTACTS, **TASK7_ROOT_CONTACTS}

assert len(LEGACY_ROOT_CONTACTS) == 32
assert len(TASK7_ROOT_CONTACTS) == 23
assert len(ALLOWED_ROOT_CONTACTS) == 55
assert all(len(pair) == 2 and reason for pair, reason in ALLOWED_ROOT_CONTACTS.items())
