import logging
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

engine = None
async_session_factory = None


class Base(DeclarativeBase):
    pass


def init_engine(database_url: str):
    """Initialize the async SQLAlchemy engine and session factory."""
    global engine, async_session_factory
    engine = create_async_engine(database_url, echo=False, pool_size=5, max_overflow=10)
    async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    logger.info("Database engine initialized")


async def create_tables():
    """Create all tables defined in models."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")


def get_session_factory():
    """Return the session factory (must be called after init_engine)."""
    return async_session_factory


async def get_async_session() -> AsyncSession:
    """Dependency that yields an async DB session."""
    async with async_session_factory() as session:
        yield session


async def dispose_engine():
    """Dispose of the engine on shutdown."""
    global engine
    if engine:
        await engine.dispose()
        logger.info("Database engine disposed")
