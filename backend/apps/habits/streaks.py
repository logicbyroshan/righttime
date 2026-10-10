from datetime import date, timedelta


def calculate_habit_streaks(habit, today=None):
    """
    Calculates current_streak, best_streak, and completed_today for a habit.
    today defaults to date.today().
    """
    if today is None:
        today = date.today()

    completions = (
        habit.completions.filter(completed=True, is_deleted=False)
        .values_list('local_date', flat=True)
        .distinct()
    )
    completed_dates = sorted(set(completions))

    if not completed_dates:
        return {
            'current_streak': 0,
            'best_streak': 0,
            'completed_today': False,
        }

    completed_today = today in completed_dates

    # Calculate best streak
    best_streak = 1
    current_run = 1
    for i in range(1, len(completed_dates)):
        if completed_dates[i] == completed_dates[i - 1] + timedelta(days=1):
            current_run += 1
        elif completed_dates[i] > completed_dates[i - 1] + timedelta(days=1):
            current_run = 1
        if current_run > best_streak:
            best_streak = current_run

    # Calculate current streak
    # Streak is active if either today or yesterday is completed
    current_streak = 0
    date_set = set(completed_dates)

    if today in date_set:
        check_date = today
        while check_date in date_set:
            current_streak += 1
            check_date -= timedelta(days=1)
    elif (today - timedelta(days=1)) in date_set:
        check_date = today - timedelta(days=1)
        while check_date in date_set:
            current_streak += 1
            check_date -= timedelta(days=1)
    else:
        current_streak = 0

    return {
        'current_streak': current_streak,
        'best_streak': max(best_streak, current_streak),
        'completed_today': completed_today,
    }
