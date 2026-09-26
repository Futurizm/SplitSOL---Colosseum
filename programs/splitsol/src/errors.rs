use anchor_lang::prelude::*;

/// Кастомные ошибки SplitSOL.
/// Индексы кодируются Anchor'ом в `error_code`, фронтенд читает их из IDL.
#[error_code]
pub enum SplitSolError {
    #[msg("Количество участников должно быть больше 0")]
    InvalidMemberCount,

    #[msg("Сумма должна быть больше 0")]
    InvalidAmount,

    #[msg("Группа не активна")]
    GroupNotActive,

    #[msg("Только создатель группы может выполнить это действие")]
    UnauthorizedOwner,

    #[msg("Вы не являетесь участником этой группы")]
    UnauthorizedMember,

    #[msg("Вы уже оплатили свою долю")]
    AlreadyPaid,

    #[msg("Недостаточно токенов на балансе")]
    InsufficientFunds,

    #[msg("Не все участники оплатили — расчёт невозможен")]
    NotFullyPaid,

    #[msg("Превышено максимальное количество участников (10)")]
    TooManyMembers,

    #[msg("Неверный invite code")]
    InvalidInviteCode,

    #[msg("Сумма долей превышает общий счёт")]
    AmountOverflow,

    #[msg("Переведённая сумма не совпадает с общим счётом")]
    AmountMismatch,

    #[msg("Ошибка вывода средств: нечего возвращать")]
    NothingToRefund,

    #[msg("Передан не весь список участников — отмена невозможна")]
    IncompleteMemberList,

    #[msg("Mint токена не совпадает с mint группы")]
    WrongMint,

    #[msg("Токен-аккаунт принадлежит другому кошельку")]
    InvalidTokenAccount,

    #[msg("Аккаунт группы не соответствует своим PDA-сидам")]
    InvalidGroupAccount,

    #[msg("Аккаунт участника не соответствует своим PDA-сидам")]
    InvalidMemberAccount,

    #[msg("Получатель средств не совпадает с получателем группы")]
    InvalidRecipient,
}
