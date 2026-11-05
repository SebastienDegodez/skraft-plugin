from jobs.settle import settle


def test_settle_keeps_the_amount() -> None:
    assert settle(10000) == 10000
