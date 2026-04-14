import contextvars

_current_company = contextvars.ContextVar("current_company", default=None)


def set_current_company(company):
    _current_company.set(company)


def get_current_company():
    return _current_company.get()
