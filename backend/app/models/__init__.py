# Import the model modules for their side effect: registering each mapped class
# on ``Base.metadata`` so Alembic autogenerate sees the full schema. Import model
# classes explicitly from their defining module (e.g. ``from app.models.user
# import User``) rather than re-exporting names here.
from app.models import (  # noqa: F401
    asset,
    comment,
    folder,
    job,
    membership,
    project,
    speaker,
    transcript,
    user,
    video,
)
